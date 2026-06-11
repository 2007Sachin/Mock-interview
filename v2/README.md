# Pathwise Mock Interview — v2

> **New here? Start with the step-by-step [GETTING_STARTED.md](./GETTING_STARTED.md)** — it covers everything from installing Git/Node to running the app, written for non-coders.

A minimal, turn-based rebuild of the mock-interview app. No websockets, no streaming, no Python service — just plain HTTP:

1. The interviewer's question is shown on screen and spoken in the browser (Kokoro TTS, runs locally in the browser).
2. You click **Answer**, speak, click **Done**. The browser records one audio clip (MediaRecorder).
3. The clip is uploaded to the Node backend, which sends it to Groq's hosted Whisper for transcription and returns the next question.

## Stack

| Piece | Choice |
| --- | --- |
| Frontend | React + Vite (`v2/web`) |
| Backend | Single Node + Express service (`v2/server`) |
| Speech-to-text | Groq hosted `whisper-large-v3` (audio file transcription) |
| LLM | Groq chat completions (`GROQ_MODEL`) |
| Text-to-speech | Kokoro (`kokoro-js`, in the browser) |
| Storage | JSON files behind a `SessionStore` interface (`STORAGE_BACKEND=file`) |

## Running locally

Prerequisite: Node.js 20+ and a free Groq API key from <https://console.groq.com>.

```bash
# 1. Backend
cd v2/server
cp .env.example .env        # then paste your GROQ_API_KEY into .env
npm install
npm run dev                 # -> "mock-interview v2 server listening on http://localhost:3001"

# 2. Frontend (second terminal)
cd v2/web
npm install
npm run dev                 # -> http://localhost:5173
```

Open <http://localhost:5173> in Chrome or Edge (best MediaRecorder support).

## Build & lint

Each package builds and type-checks independently:

```bash
cd v2/server && npm run lint && npm run build
cd v2/web    && npm run lint && npm run build
```

Both `lint` scripts run the TypeScript compiler in strict mode over the whole package (no separate linter dependency).

---

## Stage verification

### Stage 1 — core turn loop ✅

What exists: `POST /api/session` (brief generation via the LLM, PDF parsing for resume/capstone), `POST /api/session/:id/answer` (audio upload → Groq Whisper → transcript → next question), and a minimal room with spoken questions and a push-to-talk answer flow.

Verify it locally:

1. Start backend and frontend as above; confirm the backend prints `listening on http://localhost:3001` and `curl http://localhost:3001/api/health` returns `{"ok":true}`.
2. Open <http://localhost:5173>. Choose **A skill or topic**, type a skill you know (e.g. "React"), set **Number of questions** to **2**, click **Start interview**.
3. The first question appears on screen and is read aloud (the first time, the Kokoro voice model (~90 MB) downloads in the background — the question text shows immediately either way).
4. Click **Answer**, allow microphone access, speak a real answer, click **Done**.
5. Watch the "Transcribing your answer…" state, then check that **your previous answer** appears as an accurate transcript and the second question is shown and spoken.
6. Answer question 2 the same way. You should land on **Interview complete** with the transcript of your last answer.
7. Optional: confirm the session was persisted — `ls v2/server/data/sessions/` shows one JSON file containing your transcripts.
