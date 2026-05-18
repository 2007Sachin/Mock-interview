from datetime import UTC, datetime

from app.career_ops.client import CareerEngineClient
from app.pipecat_runtime.pipeline_factory import PipelineRuntime


async def persist_transcript(runtime: PipelineRuntime, speaker: str, stage_id: str, text: str) -> dict:
    payload = {
        "mock_interview_id": runtime.bootstrap.mock_interview["mock_interview_id"],
        "attempt_id": runtime.bootstrap.mock_interview["attempt_id"],
        "stage_id": stage_id,
        "speaker": speaker,
        "text": text,
        "timestamp": datetime.now(UTC).isoformat(),
        "final": True,
    }
    await CareerEngineClient().post_transcript(runtime.bootstrap.callback_urls["transcript_event"], payload)
    return payload
