from app.career_ops.client import CareerEngineClient
from app.pipecat_runtime.pipeline_factory import PipelineRuntime
from app.pipecat_runtime.processors.transcript_collector import persist_transcript


async def start_interview(runtime: PipelineRuntime) -> list[dict]:
    stage = runtime.stage_manager.current_stage
    await CareerEngineClient().post_stage_event(
        runtime.bootstrap.callback_urls["stage_event"],
        {
            "attempt_id": runtime.bootstrap.mock_interview["attempt_id"],
            "event_type": "interview_started",
            "payload": {
                "voice_session_id": runtime.session_id,
                "stage_id": stage.stage_id,
                "provider": runtime.provider,
            },
        },
    )
    await persist_transcript(runtime, "interviewer", stage.stage_id, runtime.stage_manager.opening_message())
    return [
        {"type": "runtime", "data": {"event": "interview_started", "provider": runtime.provider}},
        {"type": "ui-command", "data": runtime.stage_manager.stage_progress_command()},
        {
            "type": "assistant-message",
            "data": {
                "stage_id": stage.stage_id,
                "text": runtime.stage_manager.opening_message(),
            },
        },
    ]


async def candidate_turn(runtime: PipelineRuntime, text: str) -> list[dict]:
    runtime.stage_manager.mark_question()
    stage = runtime.stage_manager.current_stage
    events = [
        {
            "type": "transcript",
            "data": {
                "stage_id": stage.stage_id,
                "speaker": "candidate",
                "text": text,
            },
        }
    ]

    if runtime.stage_manager.should_open_workspace():
        workspace_command = runtime.stage_manager.workspace_command()
        if workspace_command:
            assistant_text = "I opened the workspace. Please solve it and explain your approach as you work."
            await CareerEngineClient().post_stage_event(
                runtime.bootstrap.callback_urls["stage_event"],
                {
                    "attempt_id": runtime.bootstrap.mock_interview["attempt_id"],
                    "event_type": "workspace_opened",
                    "payload": {"stage_id": stage.stage_id},
                },
            )
            await persist_transcript(runtime, "interviewer", stage.stage_id, assistant_text)
            events.append({"type": "ui-command", "data": workspace_command})
            events.append(
                {
                    "type": "assistant-message",
                    "data": {
                        "stage_id": stage.stage_id,
                        "text": assistant_text,
                    },
                }
            )
            return events

    if runtime.stage_manager.should_advance():
        advanced = runtime.stage_manager.advance()
        if advanced:
            next_stage = runtime.stage_manager.current_stage
            await CareerEngineClient().post_stage_event(
                runtime.bootstrap.callback_urls["stage_event"],
                {
                    "attempt_id": runtime.bootstrap.mock_interview["attempt_id"],
                    "event_type": "stage_started",
                    "payload": {"stage_id": next_stage.stage_id, "title": next_stage.title},
                },
            )
            await persist_transcript(runtime, "interviewer", next_stage.stage_id, next_stage.opening_message)
            events.append({"type": "ui-command", "data": runtime.stage_manager.stage_progress_command()})
            events.append(
                {
                    "type": "assistant-message",
                    "data": {"stage_id": next_stage.stage_id, "text": next_stage.opening_message},
                }
            )
            return events

    followup = stage.question_bank[min(runtime.stage_manager.state.question_count, max(0, len(stage.question_bank) - 1))] if stage.question_bank else "Can you explain your reasoning a bit more?"
    await persist_transcript(runtime, "interviewer", stage.stage_id, followup)
    events.append({"type": "assistant-message", "data": {"stage_id": stage.stage_id, "text": followup}})
    return events
