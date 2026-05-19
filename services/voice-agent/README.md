# Voice Agent Transport Runtime

This service runs the local Pathwisse voice interview runtime in place under `services/voice-agent/`.

## Transport modes

- Local/dev default: `VOICE_TRANSPORT=websocket`
- Production path: `VOICE_TRANSPORT=daily`
- Node issues the voice token and owns the browser connect payload
- Python validates the token, fetches private voice context from Node, orchestrates the interview, and persists transcript events and finalized turns back to Node
- Browser Kokoro is the TTS UX; Python emits `assistant_text` events and does not use server-side TTS as the primary experience
- Daily keeps the same browser event contract and persistence intent, but the browser must never receive the Daily API key or the Pipecat secret

## Environment

Copy `.env.example` to `.env` and set the Mistral key if you want live orchestration:

```powershell
Copy-Item .env.example .env
```

Required settings:

- `NODE_API_BASE_URL=http://localhost:4174`
- `PIPECAT_CONNECT_SECRET=dev-pipecat-secret`
- `VOICE_TRANSPORT=websocket`
- `PIPECAT_ROOM_PROVIDER=daily`
- `STT_PROVIDER=whisper` or `openai_realtime`
- `LLM_PROVIDER=mistral`
- `MISTRAL_API_KEY=...`
- `TTS_PROVIDER=kokoro_browser`
- `PORT=7860`

Additional Daily-only settings when `VOICE_TRANSPORT=daily`:

- `PIPECAT_DAILY_API_KEY=...`
- `PIPECAT_DAILY_DOMAIN=your-domain.daily.co`

Daily credentials are not needed for local websocket mode.

## Install and run

With `uv`:

```powershell
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 7860
```

Fallback if you are using `requirements.txt` directly:

```powershell
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 7860
```

## Websocket flow

1. Node returns a websocket `pipecatConnectUrl` and `voiceToken`.
2. The browser connects to `/v1/realtime/:sessionId?token=...`.
3. Python validates the signed token with `PIPECAT_CONNECT_SECRET`.
4. Python fetches `GET /api/internal/interview-sessions/:sessionId/voice-context` with `x-pipecat-secret`.
5. Python emits safe frontend events only:
   - `user_interim_transcript`
   - `user_final_transcript`
   - `assistant_text`
   - `bot_thinking`
   - `error`
   - `interview_complete`

## Browser transcript fallback

Phase 6 keeps an STT abstraction but supports a documented browser transcript fallback for local websocket mode. The browser can send websocket JSON messages like:

```json
{ "type": "user_interim_transcript", "text": "I worked on..." }
{ "type": "user_final_transcript", "text": "I led a migration...", "eventId": "client-evt-1" }
```

Audio streaming transport tightening and Daily production media handling are Phase 7 work.

## Daily flow

1. Node remains the source of truth for `VOICE_TRANSPORT`.
2. When `VOICE_TRANSPORT=daily`, Node validates `PIPECAT_DAILY_API_KEY`, `PIPECAT_DAILY_DOMAIN`, `PIPECAT_ROOM_PROVIDER=daily`, and `PIPECAT_SERVICE_URL`.
3. Node returns only safe Daily client metadata to the browser.
4. If Daily room provisioning is unavailable, Node returns a sanitized setup error instead of a fake connect payload.
5. The Python runtime exposes a Daily seam alongside the existing websocket runtime so deployments can select transport without changing the browser event contract or moving Kokoro server-side.

## Persistence

Python is the single writer for:

- `POST /api/interview-sessions/:sessionId/transcript-events`
- `POST /api/interview-sessions/:sessionId/turns`

The runtime uses stable UUIDs derived from `eventId` and `turnId` seeds so retries stay duplicate-safe.
