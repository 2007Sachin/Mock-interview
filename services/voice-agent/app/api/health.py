from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
    return {"success": True, "data": {"service": "pathwisse-voice-agent", "status": "ok"}}
