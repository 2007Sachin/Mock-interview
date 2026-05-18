import asyncio
from datetime import UTC, datetime
from typing import Any

import httpx

from app.career_ops.schemas import ValidationResponseData
from app.core.config import settings
from app.core.observability import log_event
from app.core.security import signed_callback_headers
from app.core.state_store import state_store


class CareerEngineClient:
    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.career_engine_base_url).rstrip("/")

    async def validate_access_code(self, mock_interview_id: str, access_code: str, client: dict[str, Any]) -> ValidationResponseData:
        async with httpx.AsyncClient(timeout=15) as http:
            response = await http.post(
                f"{self.base_url}/v1/mock-interviews/{mock_interview_id}/validate-access-code",
                json={"access_code": access_code, "client": client},
            )
            response.raise_for_status()
            payload = response.json()
            if not payload.get("success"):
                raise ValueError(payload.get("error", {}).get("message", "Validation failed"))
            return ValidationResponseData.model_validate(payload["data"])

    async def post_stage_event(self, url: str, payload: dict[str, Any]) -> None:
        await self._post_callback("stage_event", url, payload)

    async def post_transcript(self, url: str, payload: dict[str, Any]) -> None:
        await self._post_callback("transcript_event", url, payload)

    async def post_workspace_submission(self, url: str, payload: dict[str, Any]) -> None:
        await self._post_callback("workspace_submission", url, payload)

    async def post_final_report(self, url: str, payload: dict[str, Any]) -> None:
        await self._post_callback("final_report", url, payload)

    async def _post_callback(self, kind: str, url: str, payload: dict[str, Any]) -> None:
        last_error = ""
        attempts = max(1, settings.callback_retry_attempts)
        async with httpx.AsyncClient(timeout=10) as http:
            for attempt in range(1, attempts + 1):
                try:
                    response = await http.post(url, json=payload, headers=signed_callback_headers(payload))
                    response.raise_for_status()
                    if attempt > 1:
                        log_event("callback_retry_succeeded", callback_kind=kind, attempt=attempt, url=url)
                    return
                except Exception as exc:
                    last_error = str(exc)
                    log_event("callback_failed", callback_kind=kind, attempt=attempt, attempts=attempts, url=url, error=last_error)
                    if attempt < attempts:
                        await asyncio.sleep(settings.callback_retry_base_delay_seconds * (2 ** (attempt - 1)))

        dead_letter = {
            "kind": kind,
            "url": url,
            "payload": payload,
            "error": last_error,
            "failed_at": datetime.now(UTC).isoformat(),
        }
        await state_store.append_json("callback_deadletter", dead_letter)
        log_event("callback_deadlettered", callback_kind=kind, url=url, error=last_error)
