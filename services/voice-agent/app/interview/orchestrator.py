from __future__ import annotations

import json
from dataclasses import dataclass

import httpx
from pydantic import BaseModel

from app.career_ops.client import InternalVoiceContext
from app.core.config import settings
from app.interview.prompt_builder import build_mistral_messages


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


class MistralInterviewOrchestrator:
    def __init__(self) -> None:
        self._timeout = settings.request_timeout_seconds

    async def generate_turn(self, request: OrchestratorInput) -> AssistantTurn:
        if settings.mistral_api_key.strip():
            try:
                return await self._generate_with_mistral(request)
            except Exception:
                pass
        return self._generate_fallback(request)

    async def _generate_with_mistral(self, request: OrchestratorInput) -> AssistantTurn:
        payload = {
            "model": settings.mistral_llm_model,
            "temperature": settings.mistral_temperature,
            "max_tokens": settings.mistral_max_tokens,
            "messages": build_mistral_messages(
                context=request.context,
                stage=request.stage,
                prior_user_turns=request.prior_user_turns,
                latest_user_text=request.latest_user_text,
                is_final_stage=request.is_final_stage,
            ),
        }
        headers = {
            "Authorization": f"Bearer {settings.mistral_api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post("https://api.mistral.ai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        content = _extract_content(response.json())
        parsed = _parse_json_object(content)
        return AssistantTurn.model_validate(parsed)

    def _generate_fallback(self, request: OrchestratorInput) -> AssistantTurn:
        role = request.context.opportunity.title
        company = request.context.opportunity.company
        stage_label = request.stage.replace("_", " ").replace("-", " ").strip().title() or "Interview"
        if request.is_final_stage:
            return AssistantTurn(
                stage=request.stage,
                assistantText=f"Thanks. That covers the interview for the {role} role at {company}.",
                question="",
                shouldWaitForUser=False,
                isInterviewComplete=True,
            )

        stage_hint = {
            "intro": f"What makes you a strong fit for this {role} role at {company}?",
            "behavioral": "Tell me about a specific time you handled a difficult challenge or conflict.",
            "technical": "Walk me through how you would solve a representative problem for this role.",
            "closing": "What questions do you have about the role or team?",
        }.get(request.stage.lower())

        if not stage_hint:
            missing_skills = request.context.opportunity.missingSkills
            if missing_skills:
                stage_hint = f"Can you describe a time you applied {missing_skills[0]} in real work?"
            else:
                stage_hint = f"What experience best prepares you for this {role} role?"

        return AssistantTurn(
            stage=request.stage,
            assistantText=stage_hint,
            question=stage_hint,
            shouldWaitForUser=True,
            isInterviewComplete=False,
        )


def _extract_content(payload: dict) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("Mistral response did not contain choices.")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise ValueError("Mistral response did not contain a message.")

    content = message.get("content")
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        text_parts = [item.get("text", "") for item in content if isinstance(item, dict)]
        merged = "".join(part for part in text_parts if isinstance(part, str))
        if merged.strip():
            return merged

    raise ValueError("Mistral response content was empty.")


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
        raise ValueError("Mistral response did not contain a JSON object.")

    return json.loads(normalized[start : end + 1])
