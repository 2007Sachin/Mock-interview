from app.career_ops.schemas import BootstrapPayload


def generate_final_report(bootstrap: BootstrapPayload, stage_scores: dict[str, int]) -> dict:
    results = []
    for stage in bootstrap.stages:
        score = stage_scores.get(stage.stage_id, 76)
        results.append(
            {
                "stage_id": stage.stage_id,
                "title": stage.title,
                "score": score,
                "feedback": f"{stage.title} completed with usable signal. Keep practicing with stronger examples.",
            }
        )

    overall = round(sum(item["score"] for item in results) / max(1, len(results)))
    recommendation = "ready_with_minor_gaps" if overall >= 70 else "needs_practice"
    return {
        "mock_interview_id": bootstrap.mock_interview["mock_interview_id"],
        "attempt_id": bootstrap.mock_interview["attempt_id"],
        "student_id": bootstrap.student["student_id"],
        "selected_role": bootstrap.role["title"],
        "overall_score": overall,
        "recommendation": recommendation,
        "summary": "Candidate shows promising role alignment. Improve specificity, metrics, and testing/accessibility examples.",
        "stage_results": results,
        "skill_gaps": [
            {"skill": "Frontend testing", "severity": "medium", "recommended_learning_path_id": "lp_testing_101"},
            {"skill": "Accessibility", "severity": "medium", "recommended_learning_path_id": "lp_a11y_101"},
        ],
        "next_actions": [
            "Complete a focused testing module",
            "Prepare one measurable project story",
            "Retake a role-specific mock interview in 7 days",
        ],
        "transcript_url": f"https://career.pathwisse.com/reports/{bootstrap.mock_interview['mock_interview_id']}/transcript",
    }
