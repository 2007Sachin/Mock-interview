from typing import Any, Literal

from pydantic import BaseModel, Field


class AccessCodeClient(BaseModel):
    timezone: str = "Asia/Kolkata"
    browser: str | None = None
    audio_supported: bool = True
    workspace_supported: bool = True


class ValidateAccessCodeRequest(BaseModel):
    mock_interview_id: str
    access_code: str
    client: AccessCodeClient = Field(default_factory=AccessCodeClient)


class StageRubricCriterion(BaseModel):
    id: str
    name: str
    scale: int = 5
    description: str | None = None


class WorkspaceDefinition(BaseModel):
    workspace_type: Literal["coding", "case_study", "system_design"]
    language: str | None = None
    title: str
    instructions: str | None = None
    prompt: str | None = None
    starter_code: str | None = None
    timer_seconds: int
    submission_required: bool = True
    test_cases: list[dict[str, Any]] = Field(default_factory=list)


class InterviewStage(BaseModel):
    stage_id: str
    sequence: int
    type: str
    title: str
    duration_seconds: int
    opening_message: str
    system_prompt: str
    question_bank: list[str] = Field(default_factory=list)
    workspace: WorkspaceDefinition | None = None
    rubric: dict[str, list[StageRubricCriterion]]
    completion_rules: dict[str, Any] = Field(default_factory=dict)


class BootstrapPayload(BaseModel):
    schema_version: Literal["mock_interview_bootstrap.v1"]
    request_id: str
    tenant: dict[str, Any]
    student: dict[str, Any]
    mock_interview: dict[str, Any]
    role: dict[str, Any]
    resume: dict[str, Any]
    job: dict[str, Any]
    interview_policy: dict[str, Any]
    voice_config: dict[str, Any]
    global_system_prompt: str
    stages: list[InterviewStage]
    callback_urls: dict[str, str]
    security: dict[str, Any]


class ValidationResponseData(BaseModel):
    voice_session_id: str
    voice_session_token: str
    bootstrap: BootstrapPayload
    transport: dict[str, Any]
