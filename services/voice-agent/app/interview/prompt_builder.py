from __future__ import annotations

import json

from app.career_ops.client import InternalVoiceContext

_QUESTION_BANK_HINT_COUNT = 4
_PRIOR_TURN_WINDOW = 6


def build_chat_messages(
    *,
    context: InternalVoiceContext,
    stage: str,
    prior_user_turns: list[dict[str, str]],
    latest_user_text: str | None,
    is_final_stage: bool,
) -> list[dict[str, str]]:
    if context.interviewMode == "capstone":
        return _build_capstone_messages(
            context=context,
            stage=stage,
            prior_user_turns=prior_user_turns,
            latest_user_text=latest_user_text,
            is_final_stage=is_final_stage,
        )
    if context.interviewMode == "skill":
        return _build_skill_messages(
            context=context,
            stage=stage,
            prior_user_turns=prior_user_turns,
            latest_user_text=latest_user_text,
            is_final_stage=is_final_stage,
        )
    return _build_resume_messages(
        context=context,
        stage=stage,
        prior_user_turns=prior_user_turns,
        latest_user_text=latest_user_text,
        is_final_stage=is_final_stage,
    )


# ---------------------------------------------------------------------------
# Resume mode — existing behaviour, unchanged
# ---------------------------------------------------------------------------

def _build_resume_messages(
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

    prior_answers = _format_saved_answers(context)
    prior_runtime_turns = prior_user_turns[-_PRIOR_TURN_WINDOW:]
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
        "briefFocusAreas": context.brief.focusAreas,
        "savedAnswers": prior_answers,
        "runtimeUserTurns": prior_runtime_turns,
        "latestUserAnswer": latest_answer,
    }

    return [
        {"role": "system", "content": "\n".join(instructions)},
        {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=True)},
    ]


# ---------------------------------------------------------------------------
# Capstone mode — probe project design, trade-offs, improvements
# ---------------------------------------------------------------------------

def _build_capstone_messages(
    *,
    context: InternalVoiceContext,
    stage: str,
    prior_user_turns: list[dict[str, str]],
    latest_user_text: str | None,
    is_final_stage: bool,
) -> list[dict[str, str]]:
    instructions = [
        "You are Pathwisse's interview voice agent conducting a capstone project review.",
        "Use the project brief only as private context — never read it out verbatim.",
        "Never invent project details not present in the brief or the candidate's answers.",
        "Never provide scoring, pass/fail language, or rubric commentary.",
        "Ask one concise question at a time and keep responses under 60 words unless closing.",
        "Adapt your depth to the current stage:",
        "  project_overview — understand what the project does and its goals;",
        "  technical_deepdive — probe implementation choices and technical complexity;",
        "  design_decisions — challenge trade-offs, alternatives considered, and justifications;",
        "  reflection — explore what the candidate would improve and lessons learned.",
        "If the interview is complete, thank the candidate briefly and do not ask another question.",
        "Return JSON only with keys: stage, assistantText, question, shouldWaitForUser, isInterviewComplete.",
    ]

    question_hints = context.brief.questionBank[:_QUESTION_BANK_HINT_COUNT]
    prior_answers = _format_saved_answers(context)
    prior_runtime_turns = prior_user_turns[-_PRIOR_TURN_WINDOW:]
    latest_answer = latest_user_text.strip() if latest_user_text else ""

    user_prompt = {
        "sessionId": context.sessionId,
        "candidateName": context.candidate.name,
        "projectTitle": context.brief.title,
        "projectSummary": context.brief.summary,
        "focusAreas": context.brief.focusAreas,
        "questionBankHints": question_hints,
        "stage": stage,
        "availableStages": context.interviewConfig.stages,
        "isFinalStage": is_final_stage,
        "savedAnswers": prior_answers,
        "runtimeUserTurns": prior_runtime_turns,
        "latestUserAnswer": latest_answer,
    }

    return [
        {"role": "system", "content": "\n".join(instructions)},
        {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=True)},
    ]


# ---------------------------------------------------------------------------
# Skill mode — assess depth at stated level across concepts/applied/edge cases
# ---------------------------------------------------------------------------

def _build_skill_messages(
    *,
    context: InternalVoiceContext,
    stage: str,
    prior_user_turns: list[dict[str, str]],
    latest_user_text: str | None,
    is_final_stage: bool,
) -> list[dict[str, str]]:
    instructions = [
        "You are Pathwisse's interview voice agent conducting a skill depth assessment.",
        "Use the skill brief only as private context — never read it out verbatim.",
        "Never invent knowledge gaps or claim the candidate said something they did not.",
        "Never provide scoring, pass/fail language, or rubric commentary.",
        "Ask one concise question at a time and keep responses under 60 words unless closing.",
        "Adapt your questions to the current stage:",
        "  fundamentals — test core concepts and foundational understanding;",
        "  applied — explore real-world usage, patterns, and practical problem-solving;",
        "  edge_cases — probe failure modes, uncommon scenarios, and surprising behaviour;",
        "  depth — assess advanced internals, nuanced trade-offs, and ecosystem awareness.",
        "If the interview is complete, thank the candidate briefly and do not ask another question.",
        "Return JSON only with keys: stage, assistantText, question, shouldWaitForUser, isInterviewComplete.",
    ]

    question_hints = context.brief.questionBank[:_QUESTION_BANK_HINT_COUNT]
    prior_answers = _format_saved_answers(context)
    prior_runtime_turns = prior_user_turns[-_PRIOR_TURN_WINDOW:]
    latest_answer = latest_user_text.strip() if latest_user_text else ""

    user_prompt = {
        "sessionId": context.sessionId,
        "candidateName": context.candidate.name,
        "assessmentTitle": context.brief.title,
        "assessmentSummary": context.brief.summary,
        "focusAreas": context.brief.focusAreas,
        "questionBankHints": question_hints,
        "stage": stage,
        "availableStages": context.interviewConfig.stages,
        "isFinalStage": is_final_stage,
        "savedAnswers": prior_answers,
        "runtimeUserTurns": prior_runtime_turns,
        "latestUserAnswer": latest_answer,
    }

    return [
        {"role": "system", "content": "\n".join(instructions)},
        {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=True)},
    ]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _format_saved_answers(context: InternalVoiceContext) -> list[dict[str, str]]:
    return [
        {
            "stage": answer.stage,
            "question": answer.question,
            "answerTranscript": answer.answerTranscript,
        }
        for answer in context.answers
    ]
