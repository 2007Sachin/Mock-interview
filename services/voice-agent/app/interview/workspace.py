from app.interview.schemas import WorkspaceSubmission


def summarize_workspace_submission(submission: WorkspaceSubmission) -> str:
    if submission.workspace_type == "coding":
        result = submission.run_results or {}
        return (
            f"Workspace submitted after {submission.elapsed_seconds}s. "
            f"Passed {result.get('passed', 0)} tests and failed {result.get('failed', 0)} tests."
        )
    return f"Workspace submitted after {submission.elapsed_seconds}s with {len(submission.answer_markdown or '')} characters."
