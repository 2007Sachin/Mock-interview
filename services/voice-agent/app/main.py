from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import time
import uuid

from app.api.health import router as health_router
from app.api.sessions import router as sessions_router

app = FastAPI(
    title="Lumina Voice Agent Service",
    description="Pipecat-compatible realtime mock interview runtime.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_observability(request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    response.headers["x-response-time-ms"] = f"{(time.perf_counter() - started) * 1000:.2f}"
    return response


app.include_router(health_router)
app.include_router(sessions_router)
