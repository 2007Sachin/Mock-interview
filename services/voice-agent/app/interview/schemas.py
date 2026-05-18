from typing import Any, Literal

from pydantic import BaseModel, Field


class RuntimeEvent(BaseModel):
    type: str
    data: dict[str, Any] = Field(default_factory=dict)


class UiCommand(BaseModel):
    type: Literal["ui-command"] = "ui-command"
    data: dict[str, Any]


class TranscriptSegment(BaseModel):
    mock_interview_id: str
    attempt_id: str
    stage_id: str
    speaker: Literal["candidate", "interviewer", "system"]
    text: str
    timestamp: str
    final: bool = True


class WorkspaceSubmission(BaseModel):
    stage_id: str
    workspace_type: Literal["coding", "case_study", "system_design"]
    code: str | None = None
    answer_markdown: str | None = None
    language: str | None = None
    elapsed_seconds: int = 0
    run_results: dict[str, Any] | None = None
