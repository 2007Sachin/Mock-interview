from __future__ import annotations

import json

from app.career_ops.client import InternalVoiceContext


def build_mistral_messages(
    *,
    context: InternalVoiceContext,
    stage: str,
    prior_user_turns: list[dict[str, str]],
    latest_user_text: str | None,
    is_final_stage: bool,
) -> list[dict[str, str]]:
    instructions = [
        "You are Pathwisse's interview voice agent.",
        "Use the resume and job description only as private context.",
        "Never reveal or quote the full resume or job description back to the candidate.",
        "Never invent candidate experience, projects, or outcomes.",
        "Never provide hidden evaluation, scoring, pass/fail language, or rubric commentary.",
        "Ask one concise interview question at a time.",
        "Keep assistant text under 60 words unless you are closing the interview.",
        "If the interview is complete, thank the candidate briefly and do not ask another question.",
        "Return JSON only with keys: stage, assistantText, question, shouldWaitForUser, isInterviewComplete.",
    ]

    prior_answers = [
        {
            "stage": answer.stage,
            "question": answer.question,
            "answerTranscript": answer.answerTranscript,
        }
        for answer in context.answers
    ]
    prior_runtime_turns = prior_user_turns[-6:]
    latest_answer = latest_user_text.strip() if latest_user_text else ""

    user_prompt = {
        "sessionId": context.sessionId,
        "candidateName": context.candidate.name,
        "roleTitle": context.opportunity.title,
        "company": context.opportunity.company,
        "stage": stage,
        "availableStages": context.interviewConfig.stages,
        "isFinalStage": is_final_stage,
        "jobDescription": context.opportunity.description,
        "matchedSkills": context.opportunity.matchedSkills,
        "missingSkills": context.opportunity.missingSkills,
        "recommendedActions": context.opportunity.recommendedActions,
        "resumeText": context.resume.text,
        "savedAnswers": prior_answers,
        "runtimeUserTurns": prior_runtime_turns,
        "latestUserAnswer": latest_answer,
    }

    return [
        {"role": "system", "content": "\n".join(instructions)},
        {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=True)},
    ]
