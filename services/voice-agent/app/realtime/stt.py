from __future__ import annotations

from dataclasses import dataclass

from pydantic import ValidationError

from app.realtime.events import BrowserTranscriptInput


class STTAdapterError(ValueError):
    pass


@dataclass(frozen=True)
class TranscriptUpdate:
    text: str
    is_final: bool
    event_seed: str
    turn_seed: str
    created_at: str | None
    metadata: dict[str, object]


class BrowserTranscriptSTTAdapter:
    def parse_message(self, payload: dict) -> TranscriptUpdate | None:
        try:
            message = BrowserTranscriptInput.model_validate(payload)
        except ValidationError as exc:
            raise STTAdapterError("Unsupported websocket message.") from exc

        if message.type == "ping":
            return None

        if message.type == "audio_chunk":
            raise STTAdapterError(
                "Audio streaming STT is not available in Phase 6 local mode. Send browser transcript events instead."
            )

        text = (message.text or "").strip()
        if not text:
            raise STTAdapterError("Transcript text is required.")

        is_final = message.type == "user_final_transcript" or bool(message.final)
        event_seed = message.eventId or text
        turn_seed = message.turnId or event_seed
        return TranscriptUpdate(
            text=text,
            is_final=is_final,
            event_seed=event_seed,
            turn_seed=turn_seed,
            created_at=message.createdAt,
            metadata=message.metadata,
        )
