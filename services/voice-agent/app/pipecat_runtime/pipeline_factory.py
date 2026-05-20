from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from fastapi import WebSocket

from app.career_ops.client import InternalVoiceContext, NodeClientError, NodeInterviewSessionClient
from app.core.config import settings
from app.core.observability import log_event
from app.interview.orchestrator import AssistantTurn, MistralInterviewOrchestrator, OrchestratorInput
from app.realtime.events import (
    AssistantTextEvent,
    build_assistant_text_event,
    build_bot_thinking_event,
    build_error_event,
    build_interview_complete_event,
    build_user_final_event,
    build_user_interim_event,
)
from app.realtime.stt import BrowserTranscriptSTTAdapter, STTAdapterError


@dataclass
class SessionConversationState:
    session_id: str
    context: InternalVoiceContext
    completed_user_turns: int
    current_stage: str
    current_question: str = ""
    awaiting_user: bool = False
    interview_complete: bool = False
    prior_user_turns: list[dict[str, str]] = field(default_factory=list)
    last_assistant_event: AssistantTextEvent | None = None


@dataclass(frozen=True)
class DailyTransportRuntime:
    event_contract: tuple[str, ...] = (
        "user_interim_transcript",
        "user_final_transcript",
        "assistant_text",
        "bot_thinking",
        "error",
        "interview_complete",
    )

    @property
    def missing_config(self) -> list[str]:
        return settings.missing_daily_config


class WebsocketPipelineRuntime:
    def __init__(self) -> None:
        self._node_client = NodeInterviewSessionClient()
        self._orchestrator = MistralInterviewOrchestrator()
        self._transcript_adapter = BrowserTranscriptSTTAdapter()
        self._sessions: dict[str, SessionConversationState] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def run(self, websocket: WebSocket, session_id: str) -> None:
        await websocket.accept()
        state = await self._load_state(session_id)
        await self._send_existing_or_next_assistant_turn(websocket, state)

        while True:
            payload = await websocket.receive_json()
            try:
                update = self._transcript_adapter.parse_message(payload)
            except STTAdapterError as exc:
                await self._emit_error(websocket, session_id, "stt_unavailable", str(exc))
                continue

            if update is None:
                continue

            async with self._session_lock(session_id):
                state = await self._load_state(session_id)
                if update.is_final:
                    await self._handle_final_transcript(websocket, state, update.text, update.event_seed, update.created_at, update.metadata)
                else:
                    await self._handle_interim_transcript(websocket, state, update.text, update.event_seed, update.created_at, update.metadata)

    async def _load_state(self, session_id: str) -> SessionConversationState:
        existing = self._sessions.get(session_id)
        if existing:
            return existing

        context = await self._node_client.get_voice_context(session_id)
        completed_user_turns = len(context.answers)
        current_stage = _resolve_stage_name(context, completed_user_turns)
        state = SessionConversationState(
            session_id=session_id,
            context=context,
            completed_user_turns=completed_user_turns,
            current_stage=current_stage,
            interview_complete=context.status == "completed",
            prior_user_turns=[
                {"stage": answer.stage, "question": answer.question, "text": answer.answerTranscript}
                for answer in context.answers
            ],
        )
        self._sessions[session_id] = state
        return state

    async def _send_existing_or_next_assistant_turn(self, websocket: WebSocket, state: SessionConversationState) -> None:
        if state.interview_complete:
            await websocket.send_json(build_interview_complete_event(state.session_id, "already_complete").model_dump())
            return

        if state.awaiting_user and state.last_assistant_event:
            await websocket.send_json(state.last_assistant_event.model_dump())
            return

        await self._send_next_assistant_turn(websocket, state)

    async def _handle_interim_transcript(
        self,
        websocket: WebSocket,
        state: SessionConversationState,
        text: str,
        event_seed: str,
        created_at: str | None,
        metadata: dict[str, object],
    ) -> None:
        event = build_user_interim_event(state.session_id, state.current_stage, text, event_seed, created_at)
        await self._node_client.persist_transcript_event(
            state.session_id,
            {
                "type": event.type,
                "eventId": event.eventId,
                "stage": event.stage,
                "text": event.text,
                "createdAt": event.createdAt,
                "metadata": metadata,
            },
        )
        await websocket.send_json(event.model_dump())

    async def _handle_final_transcript(
        self,
        websocket: WebSocket,
        state: SessionConversationState,
        text: str,
        event_seed: str,
        created_at: str | None,
        metadata: dict[str, object],
    ) -> None:
        question = state.current_question
        event = build_user_final_event(state.session_id, state.current_stage, question, text, event_seed, created_at)
        await self._node_client.persist_transcript_event(
            state.session_id,
            {
                "type": event.type,
                "eventId": event.eventId,
                "turnId": event.turnId,
                "stage": event.stage,
                "question": event.question,
                "text": event.text,
                "createdAt": event.createdAt,
                "metadata": metadata,
            },
        )
        await self._node_client.persist_turn(
            state.session_id,
            {
                "turnId": event.turnId,
                "role": "user",
                "stage": event.stage,
                "question": event.question,
                "input": event.text,
                "createdAt": event.createdAt,
                "metadata": metadata,
            },
        )
        await websocket.send_json(event.model_dump())

        state.prior_user_turns.append({"stage": event.stage, "question": event.question, "text": event.text})
        state.completed_user_turns += 1
        state.awaiting_user = False
        state.last_assistant_event = None

        await self._send_next_assistant_turn(websocket, state, latest_user_text=text)

    async def _send_next_assistant_turn(
        self,
        websocket: WebSocket,
        state: SessionConversationState,
        *,
        latest_user_text: str | None = None,
    ) -> None:
        await websocket.send_json(build_bot_thinking_event(state.session_id, True).model_dump())
        try:
            is_final_stage = state.completed_user_turns >= len(state.context.interviewConfig.stages)
            stage = _resolve_stage_name(state.context, state.completed_user_turns)
            state.current_stage = stage
            turn = await self._orchestrator.generate_turn(
                OrchestratorInput(
                    context=state.context,
                    stage=stage,
                    prior_user_turns=state.prior_user_turns,
                    latest_user_text=latest_user_text,
                    is_final_stage=is_final_stage,
                )
            )
            await self._persist_and_emit_assistant_turn(websocket, state, turn)
        except NodeClientError as exc:
            await self._emit_error(websocket, state.session_id, "node_persistence_failed", str(exc))
        except Exception:
            await self._emit_error(websocket, state.session_id, "assistant_unavailable", "Assistant orchestration is unavailable.")
        finally:
            await websocket.send_json(build_bot_thinking_event(state.session_id, False).model_dump())

    async def _persist_and_emit_assistant_turn(
        self,
        websocket: WebSocket,
        state: SessionConversationState,
        turn: AssistantTurn,
    ) -> None:
        assistant_event = build_assistant_text_event(
            state.session_id,
            turn.stage,
            turn.question,
            turn.assistantText,
            str(state.completed_user_turns),
        )
        await self._node_client.persist_transcript_event(
            state.session_id,
            {
                "type": assistant_event.type,
                "eventId": assistant_event.eventId,
                "turnId": assistant_event.turnId,
                "stage": assistant_event.stage,
                "question": assistant_event.question,
                "text": assistant_event.text,
                "createdAt": assistant_event.createdAt,
                "metadata": {"shouldWaitForUser": turn.shouldWaitForUser, "isInterviewComplete": turn.isInterviewComplete},
            },
        )
        await self._node_client.persist_turn(
            state.session_id,
            {
                "turnId": assistant_event.turnId,
                "role": "assistant",
                "stage": assistant_event.stage,
                "question": assistant_event.question,
                "input": assistant_event.text,
                "createdAt": assistant_event.createdAt,
                "metadata": {"shouldWaitForUser": turn.shouldWaitForUser, "isInterviewComplete": turn.isInterviewComplete},
            },
        )
        state.current_stage = turn.stage
        state.current_question = turn.question
        state.awaiting_user = turn.shouldWaitForUser and not turn.isInterviewComplete
        state.interview_complete = turn.isInterviewComplete
        state.last_assistant_event = assistant_event if state.awaiting_user else None
        await websocket.send_json(assistant_event.model_dump())

        if turn.isInterviewComplete:
            complete_event = build_interview_complete_event(state.session_id, assistant_event.turnId)
            await self._node_client.persist_transcript_event(
                state.session_id,
                {
                    "type": complete_event.type,
                    "eventId": complete_event.eventId,
                    "createdAt": complete_event.createdAt,
                    "metadata": {"stage": turn.stage},
                },
            )
            await websocket.send_json(complete_event.model_dump())

    async def _emit_error(self, websocket: WebSocket, session_id: str, code: str, message: str) -> None:
        event = build_error_event(session_id, code, message)
        try:
            await self._node_client.persist_transcript_event(
                session_id,
                {
                    "type": event.type,
                    "eventId": event.eventId,
                    "text": event.message,
                    "createdAt": event.createdAt,
                    "metadata": {"code": event.code},
                },
            )
        except Exception:
            log_event("error_event_persist_failed", session_id=session_id, code=code)
        await websocket.send_json(event.model_dump())

    def _session_lock(self, session_id: str) -> asyncio.Lock:
        return self._locks.setdefault(session_id, asyncio.Lock())


class PipelineFactory:
    def __init__(self) -> None:
        self._websocket_runtime = WebsocketPipelineRuntime()
        self._daily_runtime = DailyTransportRuntime()

    @property
    def voice_transport(self) -> str:
        return settings.voice_transport

    def websocket_runtime(self) -> WebsocketPipelineRuntime:
        return self._websocket_runtime

    def daily_runtime(self) -> DailyTransportRuntime:
        return self._daily_runtime

    def uses_websocket_transport(self) -> bool:
        return self.voice_transport == "websocket"


def _resolve_stage_name(context: InternalVoiceContext, completed_user_turns: int) -> str:
    stages = context.interviewConfig.stages
    if not stages:
        return "interview"
    index = min(completed_user_turns, len(stages) - 1)
    return stages[index]


pipeline_factory = PipelineFactory()
