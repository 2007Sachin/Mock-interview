# Pipecat Railway Service — Deployment Spec

## Overview

The Pathwisse mock-interview stack runs as two Railway services from the same GitHub repository.

| Service | Root directory | Runtime |
|---------|---------------|---------|
| pathwisse-mockinterview | `/` | Node 20 + React (Vite) |
| pathwisse-voice-agent | `services/voice-agent` | Python 3.11 + FastAPI |

Both services share the same repo branch (`main`). Railway detects each service by its configured root directory.

---

## Task A — Voice-agent deployability checklist

| Check | Result |
|-------|--------|
| FastAPI entrypoint | `app.main:app` |
| `/health` endpoint | `GET /health` → `{ "success": true, "data": { "service": "lumina-voice-agent-service", "status": "ok" } }` |
| WebSocket realtime route | `WS /v1/realtime/{session_id}?token=<voiceToken>` |
| `NODE_API_BASE_URL` | Read via `pydantic-settings` alias `NODE_API_BASE_URL` |
| `PIPECAT_CONNECT_SECRET` | Read via `pydantic-settings` alias `PIPECAT_CONNECT_SECRET` (required, validated non-empty) |
| `VOICE_TRANSPORT` | Read; literal `"websocket"` or `"daily"` |
| `STT_PROVIDER` | Read; literal `"whisper"` or `"openai_realtime"` |
| `WHISPER_MODEL` | Read; default `"base"` |
| `LLM_PROVIDER` | Read; literal `"mistral"` |
| `MISTRAL_API_KEY` | Read; empty default |
| `MISTRAL_LLM_MODEL` | Read; default `"mistral-small-latest"` |
| `TTS_PROVIDER` | Read; literal `"kokoro_browser"` |
| Python requirement | `>=3.11` |
| Dependency file | `requirements.txt` + `pyproject.toml` (both present) |

---

## Task B — Railway service setup

### Service 1 — Node/React (existing)

| Field | Value |
|-------|-------|
| Name | pathwisse-mockinterview |
| Source | GitHub: `MahammadWahab540/pathwisse-mockinterview` |
| Branch | `main` |
| Root directory | `/` |
| Builder | Nixpacks (auto-detected Node) |
| Start command | Nixpacks default (`node dist/server.js` or similar) |
| Health check | `GET /health` or root path |

### Service 2 — Python voice-agent (new)

| Field | Value |
|-------|-------|
| Name | pathwisse-voice-agent |
| Source | GitHub: `MahammadWahab540/pathwisse-mockinterview` |
| Branch | `main` |
| Root directory | `services/voice-agent` |
| Builder | Nixpacks (auto-detected Python via `pyproject.toml`) |
| Start command | `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/health` |
| Health check response | `{ "success": true, "data": { "service": "lumina-voice-agent-service", "status": "ok" } }` |

---

## Task C — railway.json

A `services/voice-agent/railway.json` file is committed to help Railway/Nixpacks detect the start command and health check path without manual Railway UI configuration.

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

`python -m uvicorn` works in any standard Python environment without requiring `uv`. For local development with `uv` installed, `uv run uvicorn ...` is also fine.

---

## Task D — Node/React service env (after voice-agent is deployed)

Set these in the Railway Node/React service environment. Replace `<voice-agent-domain>` with the Railway-assigned public domain of the Python service.

```env
# Public URLs
MOCK_INTERVIEW_PUBLIC_URL=https://pathwisse-mockinterview-production-e582.up.railway.app
VITE_MOCK_INTERVIEW_API_URL=https://pathwisse-mockinterview-production-e582.up.railway.app
MOCK_INTERVIEW_SERVICE_PORT=${{PORT}}

# Voice provider
VITE_VOICE_AGENT_PROVIDER=pipecat
VOICE_AGENT_PROVIDER=pipecat

# TTS (browser-side Kokoro)
VITE_TTS_PROVIDER=kokoro
TTS_PROVIDER=kokoro_browser

# Transport
VITE_VOICE_TRANSPORT=websocket
VOICE_TRANSPORT=websocket

# Pipecat Python service
PIPECAT_SERVICE_URL=https://<voice-agent-railway-domain>
PIPECAT_CONNECT_SECRET=<same-secret-as-python-service>

# Kokoro browser TTS
VITE_KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX
VITE_KOKORO_DTYPE=q8
VITE_KOKORO_DEVICE=wasm
VITE_KOKORO_VOICE=af_heart

# LLM (set to mock for initial test; switch to mistral for real reports)
LLM_PROVIDER=mock
MISTRAL_API_KEY=

# For real reports (update when ready):
# LLM_PROVIDER=mistral
# MISTRAL_API_KEY=<server-side-key-only>
```

Security rules:
- `MISTRAL_API_KEY` must never appear in a `VITE_*` variable.
- `PIPECAT_CONNECT_SECRET` must never appear in a `VITE_*` variable.

---

## Task E — Python voice-agent Railway env

Set these in the Railway `pathwisse-voice-agent` service environment.

```env
# Node API
NODE_API_BASE_URL=https://pathwisse-mockinterview-production-e582.up.railway.app
PIPECAT_CONNECT_SECRET=<same-secret-as-node-service>

# Transport
VOICE_TRANSPORT=websocket

# STT
STT_PROVIDER=whisper
WHISPER_MODEL=base
OPENAI_API_KEY=
OPENAI_STT_MODEL=gpt-4o-transcribe

# LLM
LLM_PROVIDER=mistral
MISTRAL_API_KEY=
MISTRAL_LLM_MODEL=mistral-small-latest
MISTRAL_TEMPERATURE=0.4
MISTRAL_MAX_TOKENS=700

# TTS (browser-only; Python emits assistant_text events, not audio)
TTS_PROVIDER=kokoro_browser

# Port (Railway provides this automatically)
PORT=${{PORT}}
```

Key cross-service constraints:

- `PIPECAT_CONNECT_SECRET` must be identical in both services.
- `NODE_API_BASE_URL` must point to the public Node/React Railway domain.
- `PIPECAT_SERVICE_URL` on Node must point to the public Python voice-agent Railway domain.
- Python never performs server-side Kokoro playback; `TTS_PROVIDER=kokoro_browser` means Python emits `assistant_text` events only.

---

## Task F — Node ↔ Python voice/connect compatibility

### Flow verification

1. Browser calls Node: `POST /api/interview-sessions/:sessionId/voice/connect` (Bearer token)
2. Node reads `VOICE_TRANSPORT` → `"websocket"`
3. Node signs a short-lived JWT using `PIPECAT_CONNECT_SECRET`
4. Node builds `pipecatConnectUrl`:
   - Reads `PIPECAT_SERVICE_URL` (e.g. `https://<voice-agent-domain>`)
   - Converts `https://` → `wss://`
   - Appends `/v1/realtime/:sessionId`
   - Result: `wss://<voice-agent-domain>/v1/realtime/:sessionId`
5. Node returns `{ transport, voiceToken, pipecatConnectUrl, ... }`
6. Browser opens `WebSocket(pipecatConnectUrl + "?token=" + voiceToken)`
7. Python service (`/v1/realtime/{session_id}`) validates JWT via `validate_voice_connect_token()`
8. Python fetches private context: `GET /api/internal/interview-sessions/:sessionId/voice-context` with header `x-pipecat-secret: PIPECAT_CONNECT_SECRET`
9. Node returns resume, JD, interview config
10. Python runs Pipecat pipeline and emits browser events over the WebSocket

All steps verified against current code — no mismatches found.

---

## Task G — STT and TTS clarity

### TTS

- **Provider:** Browser-side Kokoro (ONNX/WASM)
- **Control vars (build-time):**
  - `VITE_TTS_PROVIDER=kokoro`
  - `VITE_KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX`
  - `VITE_KOKORO_DTYPE=q8`
  - `VITE_KOKORO_DEVICE=wasm`
  - `VITE_KOKORO_VOICE=af_heart`
- Python emits `assistant_text` events only. It does not stream audio.

### STT

- **Provider:** Python voice-agent (Pipecat Whisper or OpenAI)
- **Control vars (runtime, server-side):**
  - `STT_PROVIDER=whisper`
  - `WHISPER_MODEL=base`
- The Python service owns all STT through the Pipecat pipeline.

### Current STT limitation

The local websocket Pipecat runtime may fall through to a browser-facing transcript fallback seam if full Pipecat STT (microphone capture → VAD → Whisper) is not fully wired in the local pipeline. The architecture and env are correct for production-grade Pipecat STT; only the Pipecat pipeline internals need tightening when real VAD/STT is validated on Railway.

---

## Task H — Manual deploy guide

1. In Railway, create the Node/React service from `MahammadWahab540/pathwisse-mockinterview`, root `/`. Set its env. Deploy.
2. In Railway, create a second service from the same repo, root `services/voice-agent`. Railway should auto-detect Python via `pyproject.toml`. The `railway.json` sets the start command to `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set it manually in the Railway UI if not picked up automatically.
3. Set the Python service env (Task E above). Deploy.
4. Visit `https://<voice-agent-railway-domain>/health`. Confirm: `{ "success": true, "data": { "service": "lumina-voice-agent-service", "status": "ok" } }`.
5. Copy the Python service Railway domain.
6. In the Node/React Railway service, set `PIPECAT_SERVICE_URL=https://<voice-agent-railway-domain>`.
7. Set `VITE_VOICE_AGENT_PROVIDER=pipecat` and `VITE_TTS_PROVIDER=kokoro` on the Node service.
8. Redeploy the Node/React service (Vite rebuild is required for `VITE_*` vars to take effect).
9. Create a new interview session via the LMS integration or API.
10. Open the interview link and enter the access code.
11. Complete mic/camera/speaker onboarding.
12. Confirm the Pipecat panel connects (status: `connected`).
13. Confirm assistant text appears in the assistant bubble.
14. Confirm browser Kokoro speaks the assistant text.
15. Confirm transcript and turn events persist without crashing.

---

## Known limitations

| Limitation | Detail |
|------------|--------|
| Whisper cold-start | First request after deploy may be slow while the model loads. |
| Browser VAD | Full STT pipeline requires mic audio to flow from browser to Python via WebSocket. Browser-side VAD seam may need tightening. |
| No reconnect | Client does not auto-reconnect on WebSocket drop. |
| CORS | Python service allows all origins (`allow_origins=["*"]`). Tighten to `VITE_MOCK_INTERVIEW_API_URL` origin before production. |
| No Postgres for voice-agent | Python service does not persist to a database directly; all persistence goes through Node API. |
| Daily transport | Not tested in this deployment. Set `VOICE_TRANSPORT=daily` with Daily credentials for Daily mode. |
