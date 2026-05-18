from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket

from pipecat.frames.frames import (
    EndFrame,
    InputTransportMessageFrame,
    LLMMessagesAppendFrame,
    OutputTransportMessageUrgentFrame as TransportMessageUrgentFrame,
    StartFrame,
    TTSSpeakFrame,
    TranscriptionFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMAssistantAggregator as LLMAssistantResponseAggregator,
    LLMUserAggregator as LLMUserResponseAggregator,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIProcessor, RTVIUIEventFrame
from pipecat.processors.frameworks.rtvi import RTVIUICommandFrame
from pipecat.serializers.protobuf import ProtobufFrameSerializer
from pipecat.services.kokoro.tts import KokoroTTSService
from pipecat.services.mistral.llm import MistralLLMService
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport

from app.career_ops.client import CareerEngineClient
from app.career_ops.schemas import BootstrapPayload
from app.core.config import settings
from app.core.observability import log_event
from app.core.state_store import state_store
from app.interview.prompt_builder import build_stage_prompt
from app.interview.scoring import generate_final_report
from app.interview.stage_manager import StageManager
from app.interview.workspace import summarize_workspace_submission
from app.interview.schemas import WorkspaceSubmission


@dataclass
class PipelineRuntime:
    session_id: str
    bootstrap: BootstrapPayload
    stage_manager: StageManager
    provider: str = "pipecat:whisper-mistral-kokoro"


@dataclass
class RuntimeResources:
    session_id: str
    bootstrap: BootstrapPayload
    stage_manager: StageManager
    rtvi: RTVIProcessor


def _message(role: str, content: str) -> dict[str, str]:
    return {"role": role, "content": content}


async def persist_transcript(session_id: str, bootstrap: BootstrapPayload, speaker: str, stage_id: str, text: str) -> dict[str, Any]:
    payload = {
        "mock_interview_id": bootstrap.mock_interview["mock_interview_id"],
        "attempt_id": bootstrap.mock_interview["attempt_id"],
        "stage_id": stage_id,
        "speaker": speaker,
        "text": text,
        "timestamp": datetime.now(UTC).isoformat(),
        "final": True,
    }
    await state_store.append_json(f"transcript:{session_id}", payload)
    await CareerEngineClient().post_transcript(bootstrap.callback_urls["transcript_event"], payload)
    return payload


class TranscriptCollectorProcessor(FrameProcessor):
    def __init__(self, resources: RuntimeResources):
        super().__init__(name="TranscriptCollectorProcessor")
        self.resources = resources

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and frame.finalized and frame.text.strip():
            stage = self.resources.stage_manager.current_stage
            payload = await persist_transcript(
                self.resources.session_id,
                self.resources.bootstrap,
                "candidate",
                stage.stage_id,
                frame.text.strip(),
            )
            await self.push_frame(RTVIUICommandFrame(command="transcript_update", payload=payload))
        await self.push_frame(frame, direction)


class InterviewStageManagerProcessor(FrameProcessor):
    def __init__(self, resources: RuntimeResources):
        super().__init__(name="InterviewStageManagerProcessor")
        self.resources = resources

    async def _emit_command(self, command: str, payload: Any) -> None:
        await self.push_frame(RTVIUICommandFrame(command=command, payload=payload))

    async def _persist_stage(self) -> None:
        await state_store.set_json(f"stage:{self.resources.session_id}", self.resources.stage_manager.snapshot())

    async def _inject_stage_prompt(self, run_llm: bool = False) -> None:
        stage = self.resources.stage_manager.current_stage
        prompt = build_stage_prompt(self.resources.bootstrap, stage)
        await self.push_frame(
            LLMMessagesAppendFrame([_message("system", prompt)], run_llm=run_llm),
            FrameDirection.UPSTREAM,
        )
        log_event("stage_prompt_injected", session_id=self.resources.session_id, stage_id=stage.stage_id)

    async def _start_or_restore(self) -> None:
        session_id = self.resources.session_id
        bootstrap = self.resources.bootstrap
        manager = self.resources.stage_manager
        restored_transcript = await state_store.list_json(f"transcript:{session_id}")
        workspace_state = await state_store.get_json(f"workspace:{session_id}")

        await self._inject_stage_prompt(False)
        await self._emit_command("interview_started", {"voice_session_id": session_id})
        await self._emit_command("transcript_restore", {"segments": restored_transcript})
        await self._emit_command("workspace_state_sync", workspace_state or {})
        await self._emit_command("stage_progress", manager.stage_progress_command()["payload"])

        if not restored_transcript:
            stage = manager.current_stage
            await CareerEngineClient().post_stage_event(
                bootstrap.callback_urls["stage_event"],
                {
                    "attempt_id": bootstrap.mock_interview["attempt_id"],
                    "event_type": "interview_started",
                    "payload": {"voice_session_id": session_id, "stage_id": stage.stage_id, "provider": "pipecat:whisper-mistral-kokoro"},
                },
            )
            await persist_transcript(session_id, bootstrap, "interviewer", stage.stage_id, manager.opening_message())
            await self.push_frame(TTSSpeakFrame(manager.opening_message(), append_to_context=True))
        await self._persist_stage()
        log_event("pipeline_hydrated", session_id=session_id, stage_id=manager.current_stage.stage_id, restored_segments=len(restored_transcript))

    async def _advance_if_ready(self) -> bool:
        manager = self.resources.stage_manager
        if not manager.should_advance():
            return False
        old_stage = manager.current_stage
        if not manager.advance():
            report = generate_final_report(self.resources.bootstrap, manager.state.stage_scores)
            await CareerEngineClient().post_final_report(self.resources.bootstrap.callback_urls["final_report"], report)
            await self._emit_command("scoring_complete", report)
            await self._emit_command("interview_completed", report)
            await self.push_frame(EndFrame())
            return True

        next_stage = manager.current_stage
        await CareerEngineClient().post_stage_event(
            self.resources.bootstrap.callback_urls["stage_event"],
            {
                "attempt_id": self.resources.bootstrap.mock_interview["attempt_id"],
                "event_type": "stage_started",
                "payload": {"from_stage_id": old_stage.stage_id, "stage_id": next_stage.stage_id, "title": next_stage.title},
            },
        )
        await self._inject_stage_prompt(False)
        await self._emit_command("stage_progress", manager.stage_progress_command()["payload"])
        await persist_transcript(self.resources.session_id, self.resources.bootstrap, "interviewer", next_stage.stage_id, next_stage.opening_message)
        await self.push_frame(TTSSpeakFrame(next_stage.opening_message, append_to_context=True))
        await self._persist_stage()
        return True

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, StartFrame):
            await self._start_or_restore()
        elif isinstance(frame, TranscriptionFrame) and frame.finalized and frame.text.strip():
            self.resources.stage_manager.mark_question()
            if self.resources.stage_manager.should_open_workspace():
                workspace_command = self.resources.stage_manager.workspace_command()
                if workspace_command:
                    await state_store.set_json(f"workspace:{self.resources.session_id}", workspace_command["payload"])
                    await self._emit_command("open_workspace", workspace_command["payload"])
                    await CareerEngineClient().post_stage_event(
                        self.resources.bootstrap.callback_urls["stage_event"],
                        {
                            "attempt_id": self.resources.bootstrap.mock_interview["attempt_id"],
                            "event_type": "workspace_opened",
                            "payload": {"stage_id": self.resources.stage_manager.current_stage.stage_id},
                        },
                    )
            await self._advance_if_ready()
            await self._persist_stage()
        await self.push_frame(frame, direction)


class WorkspaceBridgeProcessor(FrameProcessor):
    def __init__(self, resources: RuntimeResources):
        super().__init__(name="WorkspaceBridgeProcessor")
        self.resources = resources

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, InputTransportMessageFrame):
            message = frame.message
            if isinstance(message, dict) and message.get("type") == "ui-event":
                data = message.get("data", {})
                event = data.get("event")
                payload = data.get("payload") or {}
                if event == "workspace_submitted":
                    submission = WorkspaceSubmission.model_validate(payload)
                    self.resources.stage_manager.mark_workspace_submitted()
                    await state_store.set_json(f"workspace:{self.resources.session_id}", submission.model_dump(exclude_none=True))
                    await CareerEngineClient().post_workspace_submission(
                        self.resources.bootstrap.callback_urls["workspace_submission"],
                        submission.model_dump(exclude_none=True),
                    )
                    summary = summarize_workspace_submission(submission)
                    followup = f"{summary} What tradeoff did you consider while solving this?"
                    await persist_transcript(self.resources.session_id, self.resources.bootstrap, "interviewer", submission.stage_id, followup)
                    await self.push_frame(TTSSpeakFrame(followup, append_to_context=True))
                    await self.push_frame(LLMMessagesAppendFrame([_message("user", f"Workspace submitted: {payload}")], run_llm=False), FrameDirection.UPSTREAM)
                elif event == "close_workspace":
                    await self.push_frame(RTVIUICommandFrame(command="close_workspace", payload=payload))
        elif isinstance(frame, RTVIUIEventFrame) and frame.event == "workspace_submitted":
            await state_store.set_json(f"workspace:{self.resources.session_id}", frame.payload)
        await self.push_frame(frame, direction)


class PipelineFactory:
    def runtime(self, session_id: str, bootstrap: BootstrapPayload, snapshot: dict[str, Any] | None = None) -> PipelineRuntime:
        manager = StageManager(bootstrap)
        manager.hydrate(snapshot)
        return PipelineRuntime(session_id=session_id, bootstrap=bootstrap, stage_manager=manager)

    def _providers(self):
        if not settings.mistral_api_key:
            raise RuntimeError("MISTRAL_API_KEY is required for the real Pipecat runtime")
        return (
            WhisperSTTService(
                model=settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            ),
            MistralLLMService(api_key=settings.mistral_api_key, model=settings.mistral_model),
            KokoroTTSService(voice_id=settings.kokoro_voice),
        )

    def create_task(self, websocket: WebSocket, runtime: PipelineRuntime) -> PipelineTask:
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_in_sample_rate=16000,
                audio_out_enabled=True,
                audio_out_sample_rate=24000,
                audio_out_channels=1,
                serializer=ProtobufFrameSerializer(),
                session_timeout=settings.voice_session_ttl_seconds,
            ),
        )
        rtvi_processor = RTVIProcessor(transport=transport)
        stt, llm, tts = self._providers()
        context = LLMContext(messages=[_message("system", runtime.bootstrap.global_system_prompt)])
        user_aggregator = LLMUserResponseAggregator(context)
        assistant_aggregator = LLMAssistantResponseAggregator(context)
        resources = RuntimeResources(
            session_id=runtime.session_id,
            bootstrap=runtime.bootstrap,
            stage_manager=runtime.stage_manager,
            rtvi=rtvi_processor,
        )
        stage_manager = InterviewStageManagerProcessor(resources)
        workspace_processor = WorkspaceBridgeProcessor(resources)
        transcript_processor = TranscriptCollectorProcessor(resources)

        pipeline = Pipeline(
            [
                transport.input(),
                rtvi_processor,
                stt,
                user_aggregator,
                stage_manager,
                workspace_processor,
                transcript_processor,
                llm,
                tts,
                transport.output(),
                assistant_aggregator,
            ]
        )
        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                audio_in_sample_rate=16000,
                audio_out_sample_rate=24000,
                enable_metrics=True,
                enable_usage_metrics=True,
                start_metadata={
                    "voice_session_id": runtime.session_id,
                    "mock_interview_id": runtime.bootstrap.mock_interview["mock_interview_id"],
                },
            ),
            rtvi_processor=rtvi_processor,
            conversation_id=runtime.session_id,
        )

        @task.event_handler("on_pipeline_started")
        async def on_pipeline_started(_, __):
            log_event("pipeline_started", session_id=runtime.session_id)

        @task.event_handler("on_pipeline_finished")
        async def on_pipeline_finished(_, frame):
            await state_store.set_json(f"stage:{runtime.session_id}", runtime.stage_manager.snapshot())
            log_event("pipeline_finished", session_id=runtime.session_id, frame=frame.__class__.__name__)

        @task.event_handler("on_pipeline_error")
        async def on_pipeline_error(_, frame):
            log_event("pipeline_error", session_id=runtime.session_id, frame=str(frame))

        return task

    async def run(self, websocket: WebSocket, runtime: PipelineRuntime) -> None:
        task = self.create_task(websocket, runtime)
        runner = PipelineRunner(handle_sigint=False)
        await runner.run(task)


pipeline_factory = PipelineFactory()
