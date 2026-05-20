from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import NAMESPACE_URL, uuid5

from pydantic import BaseModel, Field

from app.core.config import settings


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def stable_uuid(*parts: str) -> str:
    material = "|".join(part.strip() for part in parts if part is not None)
    return str(uuid5(NAMESPACE_URL, material))


class BrowserTranscriptInput(BaseModel):
    type: Literal["user_interim_transcript", "user_final_transcript", "transcript", "audio_chunk", "ping"]
    text: str | None = None
    final: bool | None = None
    eventId: str | None = None
    turnId: str | None = None
    stage: str | None = None
    question: str | None = None
    createdAt: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


class UserInterimTranscriptEvent(BaseModel):
    type: Literal["user_interim_transcript"] = "user_interim_transcript"
    eventId: str
    sessionId: str
    stage: str
    text: str
    sttProvider: str
    sttModel: str
    createdAt: str


class UserFinalTranscriptEvent(BaseModel):
    type: Literal["user_final_transcript"] = "user_final_transcript"
    eventId: str
    turnId: str
    sessionId: str
    stage: str
    question: str
    text: str
    sttProvider: str
    sttModel: str
    createdAt: str


class AssistantTextEvent(BaseModel):
    type: Literal["assistant_text"] = "assistant_text"
    eventId: str
    turnId: str
    sessionId: str
    stage: str
    question: str
    text: str
    llmProvider: str
    llmModel: str
    ttsProvider: str
    createdAt: str


class BotThinkingEvent(BaseModel):
    type: Literal["bot_thinking"] = "bot_thinking"
    sessionId: str
    isThinking: bool


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    eventId: str
    sessionId: str
    code: str
    message: str
    createdAt: str


class InterviewCompleteEvent(BaseModel):
    type: Literal["interview_complete"] = "interview_complete"
    eventId: str
    sessionId: str
    createdAt: str


def build_user_interim_event(session_id: str, stage: str, text: str, seed: str, created_at: str | None = None) -> UserInterimTranscriptEvent:
    timestamp = created_at or utc_now_iso()
    return UserInterimTranscriptEvent(
        eventId=stable_uuid(session_id, "user_interim_transcript", stage, seed, text),
        sessionId=session_id,
        stage=stage,
        text=text,
        sttProvider=settings.provider_metadata["sttProvider"],
        sttModel=settings.provider_metadata["sttModel"],
        createdAt=timestamp,
    )


def build_user_final_event(session_id: str, stage: str, question: str, text: str, seed: str, created_at: str | None = None) -> UserFinalTranscriptEvent:
    timestamp = created_at or utc_now_iso()
    turn_id = stable_uuid(session_id, "turn", "user", stage, question, seed, text)
    return UserFinalTranscriptEvent(
        eventId=stable_uuid(session_id, "user_final_transcript", turn_id),
        turnId=turn_id,
        sessionId=session_id,
        stage=stage,
        question=question,
        text=text,
        sttProvider=settings.provider_metadata["sttProvider"],
        sttModel=settings.provider_metadata["sttModel"],
        createdAt=timestamp,
    )


def build_assistant_text_event(session_id: str, stage: str, question: str, text: str, seed: str, created_at: str | None = None) -> AssistantTextEvent:
    timestamp = created_at or utc_now_iso()
    turn_id = stable_uuid(session_id, "turn", "assistant", stage, question, seed, text)
    return AssistantTextEvent(
        eventId=stable_uuid(session_id, "assistant_text", turn_id),
        turnId=turn_id,
        sessionId=session_id,
        stage=stage,
        question=question,
        text=text,
        llmProvider=settings.provider_metadata["llmProvider"],
        llmModel=settings.provider_metadata["llmModel"],
        ttsProvider=settings.provider_metadata["ttsProvider"],
        createdAt=timestamp,
    )


def build_bot_thinking_event(session_id: str, is_thinking: bool) -> BotThinkingEvent:
    return BotThinkingEvent(sessionId=session_id, isThinking=is_thinking)


def build_error_event(session_id: str, code: str, message: str) -> ErrorEvent:
    created_at = utc_now_iso()
    return ErrorEvent(
        eventId=stable_uuid(session_id, "error", code, created_at),
        sessionId=session_id,
        code=code,
        message=message,
        createdAt=created_at,
    )


def build_interview_complete_event(session_id: str, seed: str) -> InterviewCompleteEvent:
    created_at = utc_now_iso()
    return InterviewCompleteEvent(
        eventId=stable_uuid(session_id, "interview_complete", seed),
        sessionId=session_id,
        createdAt=created_at,
    )
