from __future__ import annotations

import asyncio
from typing import Any

import httpx
from pydantic import BaseModel, Field

from app.core.config import settings


class NodeClientError(RuntimeError):
    pass


class CandidateProfile(BaseModel):
    id: str
    name: str
    email: str
    organizationId: str | None = None


class OpportunityProfile(BaseModel):
    id: str
    matchId: str
    title: str
    company: str
    location: str | None = None
    description: str
    matchedSkills: list[str] = Field(default_factory=list)
    missingSkills: list[str] = Field(default_factory=list)
    recommendedActions: list[str] = Field(default_factory=list)


class ResumeProfile(BaseModel):
    resumeId: str | None = None
    text: str
    fileName: str | None = None


class InterviewConfigProfile(BaseModel):
    mode: str
    difficulty: str
    durationMinutes: int
    stages: list[str] = Field(default_factory=list)


class SavedAnswer(BaseModel):
    stage: str
    question: str
    answerTranscript: str
    audioUrl: str | None = None
    createdAt: str


class RubricCriterion(BaseModel):
    id: str
    name: str


class InterviewBriefContext(BaseModel):
    title: str = ""
    summary: str = ""
    focusAreas: list[str] = Field(default_factory=list)
    questionBank: list[str] = Field(default_factory=list)
    rubric: list[RubricCriterion] = Field(default_factory=list)


class InternalVoiceContext(BaseModel):
    sessionId: str
    status: str
    transport: str
    requestId: str
    interviewMode: str = "resume"
    brief: InterviewBriefContext = Field(default_factory=InterviewBriefContext)
    candidate: CandidateProfile
    opportunity: OpportunityProfile
    resume: ResumeProfile
    interviewConfig: InterviewConfigProfile
    answers: list[SavedAnswer] = Field(default_factory=list)


class NodeInterviewSessionClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.node_api_base_url).rstrip("/")
        self._headers = {"x-pipecat-secret": settings.pipecat_connect_secret}
        self._timeout = settings.request_timeout_seconds

    async def get_voice_context(self, session_id: str) -> InternalVoiceContext:
        data = await self._request_json(
            "GET",
            f"/api/internal/interview-sessions/{session_id}/voice-context",
        )
        return InternalVoiceContext.model_validate(data)

    async def persist_transcript_event(self, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/api/interview-sessions/{session_id}/transcript-events",
            json=payload,
        )

    async def persist_turn(self, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/api/interview-sessions/{session_id}/turns",
            json=payload,
        )

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(1, settings.persistence_retry_attempts + 1):
            try:
                async with httpx.AsyncClient(
                    base_url=self.base_url,
                    headers=self._headers,
                    timeout=self._timeout,
                ) as client:
                    response = await client.request(method, path, json=json)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code < 500:
                    raise NodeClientError(_safe_node_error(exc.response)) from exc
                last_error = exc
            except httpx.HTTPError as exc:
                last_error = exc

            if attempt < settings.persistence_retry_attempts:
                await asyncio.sleep(settings.persistence_retry_backoff_seconds * attempt)

        raise NodeClientError("Node interview session service is unavailable.") from last_error


def _safe_node_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return "Node interview session request failed."

    message = payload.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    return "Node interview session request failed."
