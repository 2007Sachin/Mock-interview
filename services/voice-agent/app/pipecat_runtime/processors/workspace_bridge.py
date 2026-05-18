from app.career_ops.client import CareerEngineClient
from app.interview.schemas import WorkspaceSubmission
from app.interview.workspace import summarize_workspace_submission
from app.pipecat_runtime.pipeline_factory import PipelineRuntime
from app.pipecat_runtime.processors.transcript_collector import persist_transcript


async def handle_workspace_submission(runtime: PipelineRuntime, payload: dict) -> list[dict]:
    submission = WorkspaceSubmission.model_validate(payload)
    runtime.stage_manager.mark_workspace_submitted()
    summary = summarize_workspace_submission(submission)
    await CareerEngineClient().post_workspace_submission(
        runtime.bootstrap.callback_urls["workspace_submission"],
        submission.model_dump(exclude_none=True),
    )
    assistant_text = f"{summary} What tradeoff did you consider while solving this?"
    await persist_transcript(runtime, "interviewer", submission.stage_id, assistant_text)
    return [
        {"type": "workspace", "data": submission.model_dump(exclude_none=True)},
        {
            "type": "assistant-message",
            "data": {
                "stage_id": submission.stage_id,
                "text": assistant_text,
            },
        },
    ]
