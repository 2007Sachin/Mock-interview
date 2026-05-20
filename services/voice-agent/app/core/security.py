from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import jwt

from app.core.config import settings


class VoiceTokenError(ValueError):
    pass


@dataclass(frozen=True)
class VoiceConnectToken:
    session_id: str
    transport: str
    nonce: str
    iat: int
    exp: int

    @property
    def expires_at(self) -> datetime:
        return datetime.fromtimestamp(self.exp, tz=UTC)


def validate_voice_connect_token(token: str, expected_session_id: str) -> VoiceConnectToken:
    try:
        payload = jwt.decode(
            token,
            settings.pipecat_connect_secret,
            algorithms=["HS256"],
            options={"require": ["sessionId", "transport", "nonce", "iat", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise VoiceTokenError("Voice session authorization failed.") from exc
    except jwt.InvalidTokenError as exc:
        raise VoiceTokenError("Voice session authorization failed.") from exc

    try:
        claims = VoiceConnectToken(
            session_id=str(payload["sessionId"]).strip(),
            transport=str(payload["transport"]).strip(),
            nonce=str(payload["nonce"]).strip(),
            iat=int(payload["iat"]),
            exp=int(payload["exp"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise VoiceTokenError("Voice session authorization failed.") from exc

    if not claims.session_id or claims.session_id != expected_session_id:
        raise VoiceTokenError("Voice session authorization failed.")

    if claims.transport != settings.voice_transport:
        raise VoiceTokenError("Voice session authorization failed.")

    if claims.exp <= claims.iat:
        raise VoiceTokenError("Voice session authorization failed.")

    return claims
