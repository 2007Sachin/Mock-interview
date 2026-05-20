# Pathwisse Mock Interview

Pathwisse Mock Interview is the interview delivery stack for the LMS opportunity flow. It supports two runtime modes:

- browser fallback mode for simple local speech capture/playback
- Pipecat mode for realtime interview orchestration with server-side Mistral evaluation and browser-side Kokoro playback

## Architecture Overview

The repo is split into three active runtime areas:

- `src/`: the React + Vite interview UI
- `server/`: the Node + Express API for sessions, safe voice connect payloads, persistence, final reports, and LMS callbacks
- `services/voice-agent/`: the Python Pipecat service for realtime voice orchestration

Key ownership boundaries:

- Kokoro TTS is browser-only. The browser speaks assistant text locally.
- Mistral is server-side only. No Mistral key is exposed to the browser.
- Node owns authoritative final report generation, report persistence, and LMS callback delivery.
- Python is the single writer for Pipecat realtime `interview_transcript_events` and `interview_turns`.
- React displays realtime transcript events and only persists manual fallback submissions.

## Runtime Storage

- Production path: PostgreSQL via `DATABASE_URL`
- Dev-only fallback: `.data/mock-interview-store.json` when `DATABASE_URL` is missing

The file-backed store is local-development only and should not be used in production.

## Environment

Copy `.env.example` to `.env` and fill in the values for the mode you want to run.

```powershell
Copy-Item .env.example .env
```

## Local Development: Browser Fallback

Use this mode when you want the old browser speech path without Pipecat.

Required env:

```env
VITE_VOICE_AGENT_PROVIDER=browser
VITE_TTS_PROVIDER=browser_speech
```

Run:

```powershell
npm install
npm run dev:server
npm run dev:client
```

Notes:

- Browser fallback uses `speechSynthesis` for assistant playback.
- Browser fallback uses `SpeechRecognition` or `webkitSpeechRecognition` for capture when available.
- Browser support varies by OS and browser.
- Mic and autoplay permissions can block the experience.
- This mode is useful for quick local validation, not production parity.

## Local Development: Pipecat Websocket Mode

Use this mode for the local production-like flow.

Required root env:

```env
VITE_VOICE_AGENT_PROVIDER=pipecat
VITE_TTS_PROVIDER=kokoro
VOICE_TRANSPORT=websocket
PIPECAT_SERVICE_URL=http://localhost:7860
PIPECAT_CONNECT_SECRET=dev-pipecat-secret
LLM_PROVIDER=mistral
MISTRAL_API_KEY=
VITE_KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX
VITE_KOKORO_DTYPE=q8
VITE_KOKORO_DEVICE=wasm
VITE_KOKORO_VOICE=af_heart
```

Required `services/voice-agent/.env` alignment:

```env
NODE_API_BASE_URL=http://localhost:4174
PIPECAT_CONNECT_SECRET=dev-pipecat-secret
VOICE_TRANSPORT=websocket
STT_PROVIDER=whisper
LLM_PROVIDER=mistral
MISTRAL_API_KEY=
TTS_PROVIDER=kokoro_browser
PORT=7860
```

Run all three services:

```powershell
npm install
npm run dev:server
npm run dev:client
```

In `services/voice-agent/`:

```powershell
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 7860
```

Local websocket flow:

1. React requests a voice connect payload from Node.
2. Node validates the interview session and returns a safe websocket payload.
3. The browser connects to `services/voice-agent/` with a short-lived voice token.
4. Python validates the token, loads private session context from Node, orchestrates the interview, and emits safe assistant/transcript events.
5. React receives `assistant_text` events and speaks them with Kokoro locally.

Current local limitation:

- The local runtime preserves an STT abstraction, but may use the browser-facing transcript fallback seam if full Pipecat STT is not available in the local environment.

## Production Transport: Daily

Daily is the production transport path and is gated entirely by configuration.

Required env:

```env
VOICE_TRANSPORT=daily
PIPECAT_ROOM_PROVIDER=daily
PIPECAT_DAILY_API_KEY=
PIPECAT_DAILY_DOMAIN=
PIPECAT_SERVICE_URL=http://localhost:7860
```

Notes:

- Daily credentials are not required for local websocket mode.
- The browser receives only safe Daily connection metadata.
- The browser never receives `PIPECAT_DAILY_API_KEY`, `PIPECAT_CONNECT_SECRET`, full resume text, full JD text, or the Mistral API key.
- If Daily env is missing while `VOICE_TRANSPORT=daily`, Node returns a sanitized setup error instead of a fake success payload.

## Report Generation

Node owns final report generation and fallback behavior.

Relevant env:

```env
LLM_PROVIDER=mistral|mock
MISTRAL_API_KEY=
MISTRAL_LLM_MODEL=mistral-small-latest
MISTRAL_TEMPERATURE=0.3
MISTRAL_MAX_TOKENS=1200
MISTRAL_TIMEOUT_MS=15000
MISTRAL_RETRY_COUNT=1
```

Behavior:

- `LLM_PROVIDER=mistral` with a valid `MISTRAL_API_KEY` enables the Node-side Mistral report path.
- Timeout, provider, or validation failures fall back to the existing heuristic `ScoringService`.
- `LLM_PROVIDER=mock` or a missing Mistral key uses the heuristic scorer directly.
- The callback payload remains backward compatible.

## Persistence

Pipecat realtime persistence uses:

- `interview_turns`
- `interview_transcript_events`

Rules:

- Python `services/voice-agent/` is the single writer for Pipecat realtime transcript events and finalized turns.
- Transcript event writes are idempotent by `eventId`.
- Finalized turn writes are idempotent by `turnId`.
- React only persists manual fallback submissions.

## Verification Commands

Use these commands for rollout validation:

```powershell
npm run lint
npm run build:server
node --import tsx --test test/report-generation.test.ts
python -m compileall services/voice-agent/app
```

In `services/voice-agent/`:

```powershell
uv run python -c "import app.main; print('voice-agent import ok')"
```

## Troubleshooting

`Kokoro model load is slow or fails`

- Confirm `VITE_TTS_PROVIDER=kokoro`.
- Start with `VITE_KOKORO_DEVICE=wasm`.
- Refresh after enabling audio.
- Large model downloads can be slow on first use.

`Missing Mistral key`

- If `LLM_PROVIDER=mistral` but `MISTRAL_API_KEY` is empty, Node falls back to the heuristic scorer.
- No browser behavior changes are required.

`Daily env missing`

- `VOICE_TRANSPORT=daily` requires `PIPECAT_DAILY_API_KEY`, `PIPECAT_DAILY_DOMAIN`, `PIPECAT_ROOM_PROVIDER=daily`, and `PIPECAT_SERVICE_URL`.
- Missing values return a sanitized setup error from Node.

`Voice token rejected`

- Make sure `PIPECAT_CONNECT_SECRET` matches between the root `.env` and `services/voice-agent/.env`.
- Check token expiry and confirm the browser is connecting to the expected transport.

`Transcript events are not persisting`

- Confirm the Python service can reach `NODE_API_BASE_URL`.
- Confirm the internal `x-pipecat-secret` path matches `PIPECAT_CONNECT_SECRET`.
- Check whether the service is writing duplicate `eventId` or `turnId` values unexpectedly.

`Browser mic or audio permissions blocked`

- Re-enable microphone permission in the browser.
- Use the panel’s `Enable audio` action before starting the Pipecat interview.
- Some browsers require direct user interaction before audio playback.

`Websocket connection refused`

- Confirm `VOICE_TRANSPORT=websocket`.
- Confirm `PIPECAT_SERVICE_URL=http://localhost:7860`.
- Start the Python service and verify the `/v1/realtime/:sessionId` route is reachable.

`CORS or API URL mismatch`

- Confirm `VITE_MOCK_INTERVIEW_API_URL` points to the running Node server.
- Confirm the React app and Node API are using matching local ports.

## Security Notes

- Full JD and resume content stay server-side.
- Mistral, Daily, and Pipecat secrets stay server-side.
- The frontend safe-context API returns only safe display context.
- Access codes are hashed before persistence.
- Callback payloads are signed with `MOCK_INTERVIEW_CALLBACK_SECRET`.
