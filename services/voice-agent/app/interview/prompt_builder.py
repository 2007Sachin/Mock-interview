from app.career_ops.schemas import BootstrapPayload, InterviewStage


def build_stage_prompt(bootstrap: BootstrapPayload, stage: InterviewStage) -> str:
    role = bootstrap.role
    resume = bootstrap.resume
    job = bootstrap.job
    return f"""
{bootstrap.global_system_prompt}

Current stage: {stage.title}
Stage objective: {stage.system_prompt}
Time limit: {stage.duration_seconds} seconds
Role: {role.get("title")}
Job summary: {job.get("summary")}
Resume summary: {resume.get("summary")}
Known gaps: {", ".join(resume.get("risk_flags", []))}

Rules:
- Ask only questions relevant to this stage.
- Ask one question at a time.
- Use adaptive follow-ups.
- Stop after stage completion rules are met.
- Do not provide final feedback until the closing stage.
""".strip()
