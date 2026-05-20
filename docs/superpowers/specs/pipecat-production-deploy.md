# Spec: Pipecat Production Deployment

**Status:** Planning  
**Phase:** 4 of N  

## Problem

The current Railway deployment runs only the Node service in browser fallback mode. The Python Pipecat voice-agent is not deployed. Production requires real STT/VAD/LLM turn-taking through the Pipecat runtime.

## Deployment Options

### Option A — Two Railway Services (Recommended)

```
Railway Service 1: pathwisse-mockinterview (Node + React)
  - Node/Express API
  - Serves React SPA
  - Owns session management, reports, LMS callbacks
  - Exposes /api/* and /health
  
Railway Service 2: pathwisse-voice-agent (Python)
  - FastAPI + Pipecat runtime
  - Owns realtime STT, VAD, LLM interview orchestration
  - Writes transcript events and turns back to Node service
  - Exposes /health and /ws or Daily room endpoints
  
Railway Postgres: shared database
  - Used by Node service for sessions, answers, reports
  - Python service writes turns/transcript events via Node API
```

### Option B — Single Docker Service (Simpler, Less Scalable)

```
One Railway Service with Docker
  - Node on PORT (public)
  - Python on 127.0.0.1:7860 (internal)
  - Node proxies /v1/realtime/* → Python
  
Requires:
  - Dockerfile
  - scripts/start-railway.sh
  - Node WebSocket proxy middleware
```

## Recommendation

**Option A** is preferred for production. Option B is acceptable for early smoke testing only.

## Required Environment Variables

### Node Service

| Variable | Description |
|---|---|
| `PORT` | Railway-assigned public port |
| `DATABASE_URL` | Railway Postgres connection string |
| `MOCK_INTERVIEW_SERVICE_SECRET` | Secret for LMS → Node calls |
| `MOCK_INTERVIEW_CALLBACK_SECRET` | HMAC key for LMS callbacks |
| `MOCK_INTERVIEW_PUBLIC_URL` | Public URL of Node service |
| `PIPECAT_SERVICE_URL` | URL of Python voice-agent service |
| `PIPECAT_CONNECT_SECRET` | Shared secret between Node and Python |
| `VOICE_TRANSPORT` | `websocket` or `daily` |
| `LLM_PROVIDER` | `mistral` or `mock` |
| `MISTRAL_API_KEY` | Mistral API key (server-side only) |

### Python Voice-Agent Service

| Variable | Description |
|---|---|
| `PORT` | Railway-assigned public port |
| `NODE_API_BASE_URL` | URL of Node service (for turn/transcript writes) |
| `PIPECAT_CONNECT_SECRET` | Shared secret with Node service |
| `PIPECAT_ROOM_PROVIDER` | `websocket` or `daily` |
| `PIPECAT_DAILY_API_KEY` | Daily API key (if using Daily transport) |
| `PIPECAT_DAILY_DOMAIN` | Daily domain (if using Daily transport) |
| `REDIS_URL` | Optional Redis for session state |

### React Frontend (Vite build-time)

| Variable | Description |
|---|---|
| `VITE_MOCK_INTERVIEW_API_URL` | Node service public URL |
| `VITE_VOICE_AGENT_PROVIDER` | `pipecat` (not browser) |
| `VITE_TTS_PROVIDER` | `kokoro` (browser-only) |
| `VITE_VOICE_TRANSPORT` | `websocket` or `daily` |
| `VITE_KOKORO_MODEL_ID` | Kokoro model id |
| `VITE_KOKORO_DTYPE` | `q8` recommended |
| `VITE_KOKORO_DEVICE` | `wasm` |

## Health Checks

- `GET /health` on Node service returns `{ ok: true, storageMode: "postgres" }`
- `GET /health` on Python service returns `{ "success": true, "data": { "service": "lumina-voice-agent-service", "status": "ok" } }`

## Smoke Tests After Deploy

1. `POST /api/interview-sessions` → returns `{ interviewLink, accessCode }`
2. Open `interviewLink` in browser → loads React app
3. Enter `accessCode` → validates, stores token
4. Onboarding screen appears
5. Grant mic/camera
6. Speaker test passes
7. Click Start Interview
8. Assistant speaks first question (Pipecat mode)
9. Candidate speaks answer
10. Transcript appears
11. Next stage progresses automatically

## Security Requirements

- `PIPECAT_CONNECT_SECRET` must be rotated from dev value.
- `MOCK_INTERVIEW_SERVICE_SECRET` must be rotated from dev value.
- `MISTRAL_API_KEY` must never appear in browser responses.
- Resume text and full JD must never appear in browser responses.
- CORS allowlist must be set to known LMS origins.
- Rate limiting on access-code verify endpoint.

## Production Blockers (Before Launch)

- [ ] Railway Postgres attached and schema migrated
- [ ] Pipecat service deployed and healthy
- [ ] `storageMode` reports `postgres` (not `file-dev-fallback`)
- [ ] Dev secrets rotated
- [ ] CORS allowlist configured
- [ ] LMS callback URL confirmed
- [ ] Real STT/VAD functional with test interview
- [ ] Reconnect and state-restore tested
- [ ] Monitoring and structured logging configured
- [ ] Sentry or equivalent error tracking added
- [ ] Privacy disclosure shown to candidate for mic/camera
- [ ] Data retention policy defined
