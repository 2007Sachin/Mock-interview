# Pathwisse Mock Interview

Pathwisse Mock Interview is the interview delivery stack for the LMS opportunity flow. It supports two runtime modes:

- browser fallback mode for simple local speech capture/playback
- Pipecat mode for realtime interview orchestration with server-side Groq evaluation and browser-side Kokoro TTS

## Architecture Overview

The repo is split into three active runtime areas:

- `src/`: the React + Vite interview UI
- `server/`: the Node + Express API for sessions, safe voice connect payloads, persistence, final reports, and LMS callbacks
- `services/voice-agent/`: the Python Pipecat service for realtime voice orchestration

Key ownership boundaries:

- **STT**: browser Web Speech API only (`SpeechRecognition`). No server-side STT, no GPU, no per-minute cost. The browser sends final/interim transcript text over WebSocket; Python consumes those events. Chrome and Edge required.
- **TTS**: Kokoro is browser-only (Apache-2.0). The browser speaks assistant text locally at $0 cost.
- **LLM**: Groq is server-side only (Node for report generation; Python for interview orchestration). No Groq key is exposed to the browser.
- Node owns authoritative final report generation, report persistence, and LMS callback delivery.
- Python is the single writer for Pipecat realtime `interview_transcript_events` and `interview_turns`.
- React displays realtime transcript events and only persists manual fallback submissions.

## Cost model at scale

| Component | Provider | Cost |
|-----------|----------|------|
| STT | Browser Web Speech API | $0 |
| TTS | Browser Kokoro (ONNX/WASM) | $0 |
| LLM | Groq (pay-as-you-go) | ~$0.05–$0.10/interview |
| Storage | Supabase free tier | $0 (up to 500MB) |
| Compute | Railway (two services) | ~$30–$50/month |

No GPU required. Target: under $100/month at 6,000 interviews/day.

## Runtime Storage

| Backend | When | How |
|---------|------|-----|
| `file` | `STORAGE_BACKEND=file` (default locally) | `.data/mock-interview-store.json` |
| `supabase` | `STORAGE_BACKEND=supabase` | Postgres via `SUPABASE_DATABASE_URL` |
| `postgres` | `DATABASE_URL` set, no `STORAGE_BACKEND` | Direct postgres URL (legacy) |

## Environment

Copy `.env.example` to `.env` and fill in the values for the mode you want to run:

```bash
cp .env.example .env
cp services/voice-agent/.env.example services/voice-agent/.env
```

---

## Run locally

**Prerequisites:** Node 20+, Python 3.11+, `uv` (Python package manager), Chrome or Edge (browser STT).

### 1. Install dependencies

Root (Node + React):

```bash
npm install
```

Python voice agent:

```bash
cd services/voice-agent
uv sync
```

### 2. Configure environment

Root `.env` (minimum for Pipecat + Groq):

```env
VITE_VOICE_AGENT_PROVIDER=pipecat
VITE_TTS_PROVIDER=kokoro
VOICE_TRANSPORT=websocket
PIPECAT_SERVICE_URL=http://localhost:7860
PIPECAT_CONNECT_SECRET=dev-pipecat-secret
LLM_PROVIDER=groq
GROQ_API_KEY=<your-groq-api-key>
STORAGE_BACKEND=file
```

`services/voice-agent/.env` (minimum):

```env
NODE_API_BASE_URL=http://localhost:4174
PIPECAT_CONNECT_SECRET=dev-pipecat-secret
VOICE_TRANSPORT=websocket
LLM_PROVIDER=groq
GROQ_API_KEY=<your-groq-api-key>
PORT=7860
```

### 3. Start all three services

Open three terminals:

**Terminal 1 — Node API (port 4174):**

```bash
npm run dev:server
```

**Terminal 2 — React UI (port 5174):**

```bash
npm run dev:client
```

**Terminal 3 — Python voice agent (port 7860):**

```bash
cd services/voice-agent
uv run uvicorn app.main:app --host 0.0.0.0 --port 7860
```

### 4. Happy-path test

1. Open [http://localhost:5174](http://localhost:5174) in **Chrome or Edge** (browser STT requires these).
2. Choose **Skill** mode.
3. Enter a skill, e.g. `React`, and click Start.
4. Complete the device/mic check and grant microphone permission.
5. Speak your answers when the interviewer asks.
6. After the interview ends, confirm that a **scored report** renders with overall score, strengths, and improvements.

> **Note:** Browser STT (`SpeechRecognition`) requires Chrome or Edge. Firefox and Safari do not support the Web Speech API. No server-side audio is processed — the browser transcribes speech locally and sends text to the Python service.

### Ports

| Service | Port |
|---------|------|
| React UI (Vite) | 5174 |
| Node API | 4174 |
| Python voice agent | 7860 |

---

## Deploy to Railway

Two Railway services are needed: one for the Node + React bundle (repo root) and one for the Python voice agent.

### Service 1 — Node + React (repo root)

- **Root directory:** `/` (repo root)
- **Build command:** `npm run build && npm run build:server`
- **Start command:** `node dist-server/index.js`

**Environment variables:**

```env
NODE_ENV=production
PORT=<railway injects this>
MOCK_INTERVIEW_PUBLIC_URL=https://<your-railway-app-url>
MOCK_INTERVIEW_SERVICE_SECRET=<generate a secure random string>
MOCK_INTERVIEW_CALLBACK_SECRET=<generate a secure random string>
SESSION_TOKEN_SECRET=<generate a secure random string>
PIPECAT_SERVICE_URL=https://<your-python-railway-service-url>
PIPECAT_CONNECT_SECRET=<shared secret — must match voice agent service>
VOICE_TRANSPORT=websocket
LLM_PROVIDER=groq
GROQ_API_KEY=<your-groq-api-key>
GROQ_MODEL=llama-3.1-8b-instant
STORAGE_BACKEND=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<supabase service role key>
SUPABASE_DATABASE_URL=postgresql://postgres.<project-ref>:<password>@pooler.supabase.com:6543/postgres
VITE_MOCK_INTERVIEW_API_URL=https://<your-railway-app-url>
VITE_VOICE_AGENT_PROVIDER=pipecat
VITE_TTS_PROVIDER=kokoro
VITE_KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX
VITE_KOKORO_DTYPE=q8
VITE_KOKORO_DEVICE=wasm
VITE_KOKORO_VOICE=af_heart
```

### Service 2 — Python voice agent

- **Root directory:** `services/voice-agent`
- **Dockerfile:** `services/voice-agent/Dockerfile`

**Environment variables:**

```env
PORT=<railway injects this>
NODE_API_BASE_URL=https://<your-node-railway-service-url>
PIPECAT_CONNECT_SECRET=<shared secret — must match Node service>
VOICE_TRANSPORT=websocket
LLM_PROVIDER=groq
GROQ_API_KEY=<your-groq-api-key>
GROQ_MODEL=llama-3.1-8b-instant
```

**No GPU service is required.** STT runs in the student's browser; TTS runs in the student's browser. The Python service handles WebSocket session orchestration only.

### Supabase setup

Before first deploy, run the schema migrations against your Supabase project:

```bash
# Connect to Supabase's Transaction Pooler URL and apply the schema
psql $SUPABASE_DATABASE_URL -f server/db/schema.sql
```

---

## Local Development: Browser Fallback

Use this mode when you want the old browser speech path without Pipecat.

Required env:

```env
VITE_VOICE_AGENT_PROVIDER=browser
VITE_TTS_PROVIDER=browser_speech
```

Run:

```bash
npm install
npm run dev:server
npm run dev:client
```

---

## Report Generation

Node owns final report generation and fallback behavior.

Relevant env:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
GROQ_TEMPERATURE=0.3
GROQ_MAX_TOKENS=1200
GROQ_TIMEOUT_MS=15000
GROQ_RETRY_COUNT=1
```

Behavior:

- `LLM_PROVIDER=groq` with a valid `GROQ_API_KEY` enables the Node-side Groq report path.
- Timeout, provider, or validation failures fall back to the existing heuristic `ScoringService`.
- `LLM_PROVIDER=mock` or a missing Groq key uses the heuristic scorer directly.
- The callback payload remains backward compatible.

---

## Persistence

Pipecat realtime persistence uses:

- `interview_turns`
- `interview_transcript_events`

Rules:

- Python `services/voice-agent/` is the single writer for Pipecat realtime transcript events and finalized turns.
- Transcript event writes are idempotent by `eventId`.
- Finalized turn writes are idempotent by `turnId`.
- React only persists manual fallback submissions.

---

## Voice latency timings

The speak → transcribe → LLM → TTS loop is instrumented so you can see which
stage is slow when testing locally.

**Browser console** — every timing line is prefixed with `[voice-timing]`:

| Log line | What it measures |
| --- | --- |
| `question:fetch` | REST round-trip to load the next question |
| `tts:queue→first-audio` | Question text handed to TTS until the first audio actually plays (browser speechSynthesis or Kokoro) |
| `stt:listen→first-result` | Mic opened until the first recognition result arrives |
| `stt:listen→final-segment` | Mic opened until a final transcript segment lands |
| `answer:submit→next-question-ack` | "Next question" pressed until the server acknowledges the answer (browser provider) |
| `answer:submit→assistant-text` | Answer sent until the assistant's next turn arrives (Pipecat provider) |
| `llm:thinking` | Backend `bot_thinking` window (Pipecat provider) |
| `voice:connect` | Voice transport connection setup (Pipecat provider) |

**Voice-agent service logs** — structured `voice_timing` events:

- `llm:groq-turn` — Groq chat-completion round-trip.
- `llm:generate-turn` — full orchestrator turn (includes fallback path).
- `turn:final-transcript→assistant-emitted` — total server-side turn time from
  receiving the final transcript to emitting the assistant's reply.

How to read them: if `tts:queue→first-audio` dominates, the TTS engine is slow
to start (Kokoro model load / browser voice). If `llm:*` dominates, the lag is
the LLM provider or network. If `stt:*` values are large, the browser speech
engine is slow to finalize — that part is runtime/browser dependent, not code.

## Verification Commands

```bash
npm run lint
npm run build:server
node --import tsx --test test/report-generation.test.ts
python -m compileall services/voice-agent/app
```

In `services/voice-agent/`:

```bash
uv run python -c "import app.main; print('voice-agent import ok')"
```

---

## Troubleshooting

**Kokoro model load is slow or fails**

- Confirm `VITE_TTS_PROVIDER=kokoro`.
- Start with `VITE_KOKORO_DEVICE=wasm`.
- Refresh after enabling audio.
- Large model downloads can be slow on first use.

**Missing Groq key**

- If `LLM_PROVIDER=groq` but `GROQ_API_KEY` is empty, Node falls back to the heuristic scorer.
- No browser behavior changes are required.

**Browser STT not working**

- Use Chrome or Edge — Firefox and Safari do not support `SpeechRecognition`.
- Grant microphone permission in the browser.
- Browser STT requires HTTPS in production (Railway provides this automatically).

**Daily env missing**

- `VOICE_TRANSPORT=daily` requires `PIPECAT_DAILY_API_KEY`, `PIPECAT_DAILY_DOMAIN`, `PIPECAT_ROOM_PROVIDER=daily`, and `PIPECAT_SERVICE_URL`.
- Missing values return a sanitized setup error from Node.

**Voice token rejected**

- Make sure `PIPECAT_CONNECT_SECRET` matches between the root `.env` and `services/voice-agent/.env`.
- Check token expiry and confirm the browser is connecting to the expected transport.

**Transcript events are not persisting**

- Confirm the Python service can reach `NODE_API_BASE_URL`.
- Confirm the internal `x-pipecat-secret` path matches `PIPECAT_CONNECT_SECRET`.
- Check whether the service is writing duplicate `eventId` or `turnId` values unexpectedly.

**Browser mic or audio permissions blocked**

- Re-enable microphone permission in the browser.
- Use the panel's `Enable audio` action before starting the Pipecat interview.
- Some browsers require direct user interaction before audio playback.

**Websocket connection refused**

- Confirm `VOICE_TRANSPORT=websocket`.
- Confirm `PIPECAT_SERVICE_URL=http://localhost:7860` (locally).
- Start the Python service and verify the `/v1/realtime/:sessionId` route is reachable.

**CORS or API URL mismatch**

- Confirm `VITE_MOCK_INTERVIEW_API_URL` points to the running Node server.
- Confirm the React app and Node API are using matching local ports.

---

## Security Notes

- Full JD and resume content stay server-side.
- Groq, Daily, and Pipecat secrets stay server-side.
- The frontend safe-context API returns only safe display context.
- Access codes are hashed before persistence.
- Callback payloads are signed with `MOCK_INTERVIEW_CALLBACK_SECRET`.
