# Pathwisse Voice Agent

This directory contains the Python Pipecat service used by the Pathwisse mock interview stack.

## Ownership

- This service handles realtime interview orchestration.
- It validates the short-lived voice token issued by Node.
- It fetches private voice context from the Node API.
- It is the single writer for Pipecat realtime transcript events and finalized turns.
- It does not own authoritative final report generation.
- It does not send LMS callbacks.

Node remains the authority for:

- session validation
- safe browser connect payloads
- final report generation
- report persistence
- LMS callback delivery

## Architecture Notes

- Transport source of truth: `VOICE_TRANSPORT=websocket|daily`
- Kokoro is browser-only. Python emits `assistant_text` events; it does not do primary server-side TTS playback.
- Mistral stays server-side and is used here only for live interview orchestration, not for the authoritative final report.
- Private resume and JD context stay inside Node and this service only.

## Environment

Copy `.env.example` to `.env`.

```powershell
Copy-Item .env.example .env
```

Required local websocket settings:

- `NODE_API_BASE_URL=http://localhost:4174`
- `PIPECAT_CONNECT_SECRET=dev-pipecat-secret`
- `VOICE_TRANSPORT=websocket`
- `STT_PROVIDER=whisper` or `openai_realtime`
- `WHISPER_MODEL=base`
- `LLM_PROVIDER=mistral`
- `MISTRAL_API_KEY=...`
- `MISTRAL_LLM_MODEL=mistral-small-latest`
- `MISTRAL_TEMPERATURE=0.4`
- `MISTRAL_MAX_TOKENS=700`
- `TTS_PROVIDER=kokoro_browser`
- `PORT=7860`

Additional Daily-only settings:

- `PIPECAT_ROOM_PROVIDER=daily`
- `PIPECAT_DAILY_API_KEY=...`
- `PIPECAT_DAILY_DOMAIN=your-domain.daily.co`

Daily credentials are not needed for local websocket mode.

## Install and Run

Preferred `uv` flow:

```powershell
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 7860
```

Fallback if you use `requirements.txt` directly:

```powershell
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 7860
```

## Local Websocket Mode

This is the default local/dev transport.

Flow:

1. The React app asks Node for a voice connect payload.
2. Node returns a websocket `pipecatConnectUrl` and short-lived `voiceToken`.
3. The browser connects to `/v1/realtime/:sessionId?token=...`.
4. This service validates the token using `PIPECAT_CONNECT_SECRET`.
5. This service loads private voice context from `GET /api/internal/interview-sessions/:sessionId/voice-context`.
6. This service emits safe frontend events and persists them back to Node.

Frontend events emitted:

- `user_interim_transcript`
- `user_final_transcript`
- `assistant_text`
- `bot_thinking`
- `error`
- `interview_complete`

Current local limitation:

- The local websocket path may use the browser-facing transcript fallback seam if full Pipecat STT is not available locally. The STT abstraction is preserved for tighter production transport later.

## Daily Production Mode

This service also exposes a Daily transport seam behind `VOICE_TRANSPORT=daily`.

Behavior:

- Node remains the source of truth for transport selection.
- Missing Daily env produces sanitized setup errors.
- The browser receives only safe Daily client metadata.
- The browser never receives the Daily API key or the Pipecat secret.
- Kokoro remains browser-only in Daily mode as well.

## Persistence

This service writes to Node using:

- `POST /api/interview-sessions/:sessionId/transcript-events`
- `POST /api/interview-sessions/:sessionId/turns`

Persistence rules:

- Transcript events are idempotent by `eventId`.
- Finalized turns are idempotent by `turnId`.
- React only persists manual fallback submissions, not Pipecat realtime events.

## Verification

Useful checks:

```powershell
python -m compileall services/voice-agent/app
uv run python -c "import app.main; print('voice-agent import ok')"
```

## Troubleshooting

`Voice token rejected`

- Confirm `PIPECAT_CONNECT_SECRET` matches the root `.env`.
- Confirm `VOICE_TRANSPORT` matches the token transport.
- Confirm the token has not expired.

`Transcript events are not persisting`

- Confirm `NODE_API_BASE_URL` points to the running Node API.
- Confirm the internal secret matches Node.
- Check that the runtime is supplying stable `eventId` and `turnId` values.

`Websocket connection refused`

- Confirm the service is running on `PORT=7860`.
- Confirm Node is returning `PIPECAT_SERVICE_URL=http://localhost:7860`.
- Confirm `VOICE_TRANSPORT=websocket`.

`Daily setup error`

- Confirm `PIPECAT_ROOM_PROVIDER=daily`.
- Confirm `PIPECAT_DAILY_API_KEY` and `PIPECAT_DAILY_DOMAIN` are set.
- Daily credentials are not required in websocket mode.
