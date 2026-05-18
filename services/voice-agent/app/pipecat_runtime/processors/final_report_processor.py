from app.career_ops.client import CareerEngineClient
from app.interview.scoring import generate_final_report
from app.pipecat_runtime.pipeline_factory import PipelineRuntime


async def finalize_interview(runtime: PipelineRuntime) -> dict:
    report = generate_final_report(runtime.bootstrap, runtime.stage_manager.state.stage_scores)
    await CareerEngineClient().post_final_report(runtime.bootstrap.callback_urls["final_report"], report)
    return report
