from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.career_ops.schemas import BootstrapPayload, InterviewStage


@dataclass
class StageRuntimeState:
    current_stage_index: int = 0
    stage_started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    question_count: int = 0
    workspace_opened: bool = False
    workspace_submitted: bool = False
    stage_scores: dict[str, int] = field(default_factory=dict)


class StageManager:
    def __init__(self, bootstrap: BootstrapPayload):
        self.bootstrap = bootstrap
        self.state = StageRuntimeState()

    @property
    def current_stage(self) -> InterviewStage:
        return self.bootstrap.stages[self.state.current_stage_index]

    def stage_progress_command(self) -> dict[str, Any]:
        stage = self.current_stage
        elapsed = int((datetime.now(UTC) - self.state.stage_started_at).total_seconds())
        return {
            "command": "stage_progress",
            "payload": {
                "current_stage_id": stage.stage_id,
                "current_stage_title": stage.title,
                "stage_sequence": stage.sequence,
                "total_stages": len(self.bootstrap.stages),
                "remaining_seconds": max(0, stage.duration_seconds - elapsed),
            },
        }

    def snapshot(self) -> dict[str, Any]:
        return {
            "current_stage_index": self.state.current_stage_index,
            "current_stage_id": self.current_stage.stage_id,
            "stage_started_at": self.state.stage_started_at.isoformat(),
            "question_count": self.state.question_count,
            "workspace_opened": self.state.workspace_opened,
            "workspace_submitted": self.state.workspace_submitted,
            "stage_scores": self.state.stage_scores,
            "progress": self.stage_progress_command()["payload"],
        }

    def hydrate(self, snapshot: dict[str, Any] | None) -> None:
        if not snapshot:
            return
        self.state.current_stage_index = int(snapshot.get("current_stage_index", self.state.current_stage_index))
        started_at = snapshot.get("stage_started_at")
        if started_at:
            self.state.stage_started_at = datetime.fromisoformat(started_at)
        self.state.question_count = int(snapshot.get("question_count", 0))
        self.state.workspace_opened = bool(snapshot.get("workspace_opened", False))
        self.state.workspace_submitted = bool(snapshot.get("workspace_submitted", False))
        self.state.stage_scores = dict(snapshot.get("stage_scores", {}))

    def opening_message(self) -> str:
        return self.current_stage.opening_message

    def mark_question(self) -> None:
        self.state.question_count += 1

    def should_open_workspace(self) -> bool:
        return bool(self.current_stage.workspace and not self.state.workspace_opened)

    def workspace_command(self) -> dict[str, Any] | None:
        workspace = self.current_stage.workspace
        if not workspace:
            return None
        self.state.workspace_opened = True
        return {
            "command": "open_workspace",
            "payload": {
                "stage_id": self.current_stage.stage_id,
                **workspace.model_dump(),
            },
        }

    def mark_workspace_submitted(self) -> None:
        self.state.workspace_submitted = True

    def should_advance(self) -> bool:
        rules = self.current_stage.completion_rules
        min_questions = int(rules.get("min_questions", 1))
        max_questions = int(rules.get("max_questions", 3))
        if rules.get("requires_workspace_submission") and not self.state.workspace_submitted:
            return False
        return self.state.question_count >= max(min_questions, min(max_questions, self.state.question_count))

    def advance(self) -> bool:
        if self.state.current_stage_index >= len(self.bootstrap.stages) - 1:
            return False
        self.state.current_stage_index += 1
        self.state.stage_started_at = datetime.now(UTC)
        self.state.question_count = 0
        self.state.workspace_opened = False
        self.state.workspace_submitted = False
        return True
