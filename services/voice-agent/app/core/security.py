import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

import jwt

from app.core.config import settings


def sign_payload(payload: dict) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hmac.new(settings.hmac_shared_secret.encode(), body, hashlib.sha256).hexdigest()


def sign_callback_payload(payload: dict, timestamp: str) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    message = f"{timestamp}.{body}".encode()
    return hmac.new(settings.hmac_shared_secret.encode(), message, hashlib.sha256).hexdigest()


def signed_callback_headers(payload: dict) -> dict[str, str]:
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "x-mi-timestamp": timestamp,
        "x-mi-signature": sign_callback_payload(payload, timestamp),
    }


@dataclass(frozen=True)
class VoiceToken:
    voice_session_id: str
    mock_interview_id: str
    issued_at_ms: int
    student_id: str | None = None
    exp: int | None = None


def parse_voice_session_token(token: str) -> VoiceToken:
    if token.count(".") == 2:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        voice_session_id = str(payload["voice_session_id"])
        mock_interview_id = str(payload["mock_interview_id"])
        issued_at_ms = int(payload.get("iat", int(time.time())) * 1000)
        return VoiceToken(
            voice_session_id=voice_session_id,
            mock_interview_id=mock_interview_id,
            issued_at_ms=issued_at_ms,
            student_id=payload.get("student_id"),
            exp=payload.get("exp"),
        )

    # Backward-compatible parsing only for old local sessions already minted before this migration.
    decoded = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode()
    voice_session_id, mock_interview_id, issued_at = decoded.split(":")
    issued_at_ms = int(issued_at)
    if (time.time() * 1000) - issued_at_ms > settings.voice_session_ttl_seconds * 1000:
        raise ValueError("Voice session token expired")
    return VoiceToken(voice_session_id=voice_session_id, mock_interview_id=mock_interview_id, issued_at_ms=issued_at_ms)
