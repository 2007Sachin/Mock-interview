from __future__ import annotations

import json
from dataclasses import dataclass

import httpx
from pydantic import BaseModel

from app.career_ops.client import InternalVoiceContext
from app.core.config import settings
from app.interview.prompt_builder import build_chat_messages


class AssistantTurn(BaseModel):
    stage: str
    assistantText: str
    question: str
    shouldWaitForUser: bool = True
    isInterviewComplete: bool = False


@dataclass
class OrchestratorInput:
    context: InternalVoiceContext
    stage: str
    prior_user_turns: list[dict[str, str]]
    latest_user_text: str | None
    is_final_stage: bool


class GroqInterviewOrchestrator:
    def __init__(self) -> None:
        self._timeout = settings.request_timeout_seconds

    async def generate_turn(self, request: OrchestratorInput) -> AssistantTurn:
        if settings.groq_api_key.strip():
            try:
                return await self._generate_with_groq(request)
            except Exception:
                pass
        return self._generate_fallback(request)

    async def _generate_with_groq(self, request: OrchestratorInput) -> AssistantTurn:
        payload = {
            "model": settings.groq_model,
            "temperature": settings.groq_temperature,
            "max_tokens": settings.groq_max_tokens,
            "messages": build_chat_messages(
                context=request.context,
                stage=request.stage,
                prior_user_turns=request.prior_user_turns,
                latest_user_text=request.latest_user_text,
                is_final_stage=request.is_final_stage,
            ),
        }
        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        content = _extract_content(response.json())
        parsed = _parse_json_object(content)
        return AssistantTurn.model_validate(parsed)

    def _generate_fallback(self, request: OrchestratorInput) -> AssistantTurn:
        mode = request.context.interviewMode
        if mode == "capstone":
            return _fallback_capstone(request)
        if mode == "skill":
            return _fallback_skill(request)
        return _fallback_resume(request)


def _extract_content(payload: dict) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("Groq response did not contain choices.")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise ValueError("Groq response did not contain a message.")

    content = message.get("content")
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        text_parts = [item.get("text", "") for item in content if isinstance(item, dict)]
        merged = "".join(part for part in text_parts if isinstance(part, str))
        if merged.strip():
            return merged

    raise ValueError("Groq response content was empty.")


def _parse_json_object(content: str) -> dict:
    normalized = content.strip()
    if normalized.startswith("```"):
        normalized = normalized.strip("`")
        if "\n" in normalized:
            normalized = normalized.split("\n", 1)[1]
        normalized = normalized.rsplit("```", 1)[0].strip()

    start = normalized.find("{")
    end = normalized.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Groq response did not contain a JSON object.")

    return json.loads(normalized[start : end + 1])


# ---------------------------------------------------------------------------
# Mode-specific fallback generators (used when Groq is unavailable)
# ---------------------------------------------------------------------------

def _fallback_resume(request: OrchestratorInput) -> AssistantTurn:
    role = request.context.opportunity.title
    company = request.context.opportunity.company
    subject = f"{role} role at {company}"

    if request.is_final_stage:
        return AssistantTurn(
            stage=request.stage,
            assistantText=f"Thanks for your time. That wraps up the interview for the {subject}.",
            question="",
            shouldWaitForUser=False,
            isInterviewComplete=True,
        )

    hint = {
        "intro": f"What makes you a strong fit for this {subject}?",
        "behavioral": "Tell me about a specific time you handled a difficult challenge or conflict.",
        "technical": "Walk me through how you would solve a representative problem for this role.",
        "closing": "What questions do you have about the role or team?",
    }.get(request.stage.lower())

    if not hint:
        missing = request.context.opportunity.missingSkills
        hint = (
            f"Can you describe a time you applied {missing[0]} in real work?"
            if missing
            else f"What experience best prepares you for this {subject}?"
        )

    return AssistantTurn(
        stage=request.stage,
        assistantText=hint,
        question=hint,
        shouldWaitForUser=True,
        isInterviewComplete=False,
    )


def _fallback_capstone(request: OrchestratorInput) -> AssistantTurn:
    title = request.context.brief.title or "your project"

    if request.is_final_stage:
        return AssistantTurn(
            stage=request.stage,
            assistantText=f"Thanks for walking me through {title}. That concludes our review.",
            question="",
            shouldWaitForUser=False,
            isInterviewComplete=True,
        )

    hint = {
        "project_overview": f"Can you walk me through what {title} does and the problem it was designed to solve?",
        "technical_deepdive": "Which part of your implementation was most technically challenging, and how did you approach it?",
        "design_decisions": "What was the hardest design decision you made, and what alternatives did you consider?",
        "reflection": "If you could redo one aspect of this project, what would you change and why?",
    }.get(request.stage.lower())

    if not hint:
        areas = request.context.brief.focusAreas
        hint = (
            f"Can you tell me more about {areas[0]} in your project?"
            if areas
            else f"Can you describe a key technical decision you made in {title}?"
        )

    return AssistantTurn(
        stage=request.stage,
        assistantText=hint,
        question=hint,
        shouldWaitForUser=True,
        isInterviewComplete=False,
    )


def _fallback_skill(request: OrchestratorInput) -> AssistantTurn:
    title = request.context.brief.title or "this skill"

    if request.is_final_stage:
        return AssistantTurn(
            stage=request.stage,
            assistantText=f"Thanks for the discussion on {title}. That wraps up our assessment.",
            question="",
            shouldWaitForUser=False,
            isInterviewComplete=True,
        )

    hint = {
        "fundamentals": f"Can you explain a core concept you consider essential to understanding {title}?",
        "applied": f"Describe a real scenario where you used {title} to solve a practical problem.",
        "edge_cases": f"What are some edge cases or failure modes you have encountered when working with {title}?",
        "depth": f"What is a subtle or advanced aspect of {title} that many developers overlook?",
    }.get(request.stage.lower())

    if not hint:
        areas = request.context.brief.focusAreas
        hint = (
            f"How would you approach {areas[0]} in the context of {title}?"
            if areas
            else f"What do you consider the most important thing to understand about {title}?"
        )

    return AssistantTurn(
        stage=request.stage,
        assistantText=hint,
        question=hint,
        shouldWaitForUser=True,
        isInterviewComplete=False,
    )
