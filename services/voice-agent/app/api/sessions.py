from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.core.config import settings
from app.core.observability import log_event
from app.core.security import VoiceTokenError, validate_voice_connect_token
from app.pipecat_runtime.pipeline_factory import pipeline_factory

router = APIRouter(prefix="/v1")


@router.websocket("/realtime/{session_id}")
async def realtime_socket(websocket: WebSocket, session_id: str) -> None:
    if not pipeline_factory.uses_websocket_transport():
        log_event("websocket_transport_disabled", session_id=session_id, transport=settings.voice_transport)
        await websocket.close(code=4403, reason="Websocket transport is disabled for this deployment.")
        return

    token = websocket.query_params.get("token", "").strip()
    if not token:
        await websocket.close(code=4401, reason="Unauthorized.")
        return

    try:
        validate_voice_connect_token(token, session_id)
    except VoiceTokenError:
        await websocket.close(code=4403, reason="Unauthorized.")
        return

    log_event("websocket_connecting", session_id=session_id)
    try:
        await pipeline_factory.websocket_runtime().run(websocket, session_id)
    except WebSocketDisconnect:
        log_event("websocket_disconnected", session_id=session_id)
    except Exception as exc:
        log_event("websocket_error", session_id=session_id, error=str(exc))
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close(code=1011, reason="Unexpected websocket error.")
