from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.career_ops.client import CareerEngineClient
from app.career_ops.schemas import BootstrapPayload, ValidateAccessCodeRequest
from app.core.observability import log_event
from app.core.security import parse_voice_session_token
from app.core.state_store import state_store
from app.pipecat_runtime.pipeline_factory import pipeline_factory

router = APIRouter(prefix="/v1")


async def _load_runtime(voice_session_id: str, token: str):
    parsed = parse_voice_session_token(token)
    if parsed.voice_session_id != voice_session_id:
        raise HTTPException(status_code=403, detail="voice session mismatch")

    session = await state_store.get_json(f"session:{voice_session_id}")
    if not session:
        raise HTTPException(status_code=404, detail="voice session not found")
    if session.get("mock_interview_id") != parsed.mock_interview_id:
        raise HTTPException(status_code=403, detail="mock interview mismatch")
    if parsed.student_id and session.get("student_id") != parsed.student_id:
        raise HTTPException(status_code=403, detail="session owner mismatch")

    bootstrap = BootstrapPayload.model_validate(session["bootstrap"])
    stage_snapshot = await state_store.get_json(f"stage:{voice_session_id}")
    return pipeline_factory.runtime(voice_session_id, bootstrap, stage_snapshot)


@router.post("/sessions/validate-access-code")
async def validate_access_code(payload: ValidateAccessCodeRequest):
    try:
        data = await CareerEngineClient().validate_access_code(
            payload.mock_interview_id,
            payload.access_code,
            payload.client.model_dump(),
        )
        await state_store.set_json(
            f"session:{data.voice_session_id}",
            {
                "voice_session_id": data.voice_session_id,
                "mock_interview_id": data.bootstrap.mock_interview["mock_interview_id"],
                "attempt_id": data.bootstrap.mock_interview["attempt_id"],
                "student_id": data.bootstrap.student["student_id"],
                "bootstrap": data.bootstrap.model_dump(),
            },
        )
        await state_store.set_json(f"stage:{data.voice_session_id}", pipeline_factory.runtime(data.voice_session_id, data.bootstrap).stage_manager.snapshot())
        log_event("access_code_validated", session_id=data.voice_session_id, mock_interview_id=payload.mock_interview_id)
        return {"success": True, "data": data.model_dump()}
    except Exception as exc:
        log_event("access_code_failed", mock_interview_id=payload.mock_interview_id, error=str(exc))
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.post("/sessions/bootstrap")
async def bootstrap_session(payload: dict):
    token = payload.get("voice_session_token")
    if not token:
        raise HTTPException(status_code=400, detail="voice_session_token required")
    parsed = parse_voice_session_token(token)
    session = await state_store.get_json(f"session:{parsed.voice_session_id}")
    if not session:
        raise HTTPException(status_code=404, detail="voice session not found")
    return {
        "success": True,
        "data": {
            "voice_session_id": parsed.voice_session_id,
            "mock_interview_id": parsed.mock_interview_id,
            "bootstrap": session["bootstrap"],
        },
    }


@router.post("/sessions/{voice_session_id}/reconnect")
async def reconnect_session(voice_session_id: str, payload: dict):
    token = payload.get("voice_session_token")
    if not token:
        raise HTTPException(status_code=400, detail="voice_session_token required")
    runtime = await _load_runtime(voice_session_id, token)
    transcript = await state_store.list_json(f"transcript:{voice_session_id}")
    workspace = await state_store.get_json(f"workspace:{voice_session_id}")
    state = runtime.stage_manager.snapshot()
    log_event("reconnect_hydrated", session_id=voice_session_id, transcript_segments=len(transcript))
    return {
        "success": True,
        "data": {
            "voice_session_id": voice_session_id,
            "mock_interview_id": runtime.bootstrap.mock_interview["mock_interview_id"],
            "state": state,
            "transcript": transcript,
            "workspace": workspace,
        },
    }


@router.websocket("/realtime/{voice_session_id}")
async def realtime_socket(websocket: WebSocket, voice_session_id: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401, reason="voice session token required")
        return
    try:
        runtime = await _load_runtime(voice_session_id, token)
    except HTTPException as exc:
        await websocket.close(code=4403, reason=str(exc.detail))
        return
    except Exception as exc:
        await websocket.close(code=4403, reason=str(exc))
        return

    log_event("websocket_connecting", session_id=voice_session_id)
    try:
        await pipeline_factory.run(websocket, runtime)
    except WebSocketDisconnect:
        log_event("websocket_disconnected", session_id=voice_session_id)
    except Exception as exc:
        log_event("websocket_error", session_id=voice_session_id, error=str(exc))
        raise
