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

### Stage 2 — full interview flow ✅

What exists: briefing screen (focus areas, question count, expected length), mic check with playback, interviewer intro (name via `VITE_INTERVIEWER_NAME`, intro line spoken), progress header + bar, **Repeat question**, **Skip**, **End interview**, a **Type instead** text fallback, and the animated interviewer orb whose SPEAKING / LISTENING / THINKING states follow the actual turn state machine. New endpoints: `POST /api/session/:id/skip`, `POST /api/session/:id/end`, and `/answer` now also accepts a `text` field.

Verify it locally (skill mode, start to finish):

1. Start both services and open <http://localhost:5173>. Create a 4-question skill interview.
2. **Briefing**: check the title, summary, focus areas, "4 questions" and expected length are shown; continue.
3. **Mic check**: record a test clip, play it back, hear yourself; continue.
4. **Intro**: the interviewer (default name "Maya") speaks an intro line while the orb pulses indigo (SPEAKING); the Begin button enables when she finishes.
5. **Room**: confirm "Question 1 of 4" and the progress bar. While the question is read the orb is indigo/rippling (SPEAKING); click **Answer** and it turns amber and breathes (LISTENING); click **Done** and it spins dashed (THINKING) until the transcript lands.
6. Use each control once across the interview: **Repeat question** (it is re-spoken), **Type instead** (submit one typed answer and see it echoed as the transcript), **Skip** (jumps to the next question, progress advances).
7. Click **End interview** mid-way once to confirm you land on the completion screen, then run one more interview through all questions to the end.
