# Pathwise Mock Interview — v2

> **New here? Start with the step-by-step [GETTING_STARTED.md](./GETTING_STARTED.md)** — it covers everything from installing Git/Node to running the app, written for non-coders.

A minimal, turn-based rebuild of the mock-interview app. No websockets, no streaming, no Python service — just plain HTTP:

1. The interviewer's question is shown on screen and spoken in the browser (Kokoro TTS, runs locally in the browser).
2. You click **Answer**, speak, click **Done**. The browser records one audio clip (MediaRecorder).
3. The clip is uploaded to the Node backend, which sends it to Groq's hosted Whisper for transcription and returns the next question.

## Stack

| Piece | Choice |
| --- | --- |
| Frontend | React + Vite + Tailwind CSS v4 (`v2/web`) |
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

Navigation & responsiveness: a step trail (Setup → Briefing → Mic check → Meet → Interview → Report) is always visible at the top, every step screen has a **← Back** button, and all controls stay clickable while the interviewer is speaking — clicking **Answer** (or Skip / Type instead / Begin) simply interrupts the speech. Question audio starts as soon as the first sentence is synthesized (WebGPU when available, sentence-by-sentence playback) instead of waiting for the whole clip.

Verify it locally (skill mode, start to finish):

1. Start both services and open <http://localhost:5173>. Create a 4-question skill interview.
2. **Briefing**: check the title, summary, focus areas, "4 questions" and expected length are shown; continue.
3. **Mic check**: record a test clip, play it back, hear yourself; continue.
4. **Intro**: the interviewer (default name "Maya") speaks an intro line while the orb pulses indigo (SPEAKING); **Begin interview** works at any time — clicking it just cuts the intro short.
5. **Room**: confirm "Question 1 of 4" and the progress bar. While the question is read the orb is indigo/rippling (SPEAKING); click **Answer** and it turns amber and breathes (LISTENING); click **Done** and it spins dashed (THINKING) until the transcript lands.
6. Use each control once across the interview: **Repeat question** (it is re-spoken), **Type instead** (submit one typed answer and see it echoed as the transcript), **Skip** (jumps to the next question, progress advances).
7. Click **End interview** mid-way once to confirm you land on the completion screen, then run one more interview through all questions to the end.

### Stage 3 — evaluation & SWOT report ✅

What exists: when the interview ends (last answer or **End interview**), the server immediately starts generating an evaluation with the LLM — overall `{ score, summary, readinessLevel }`, a SWOT with each point citing something the candidate actually said, and per-question feedback. The output is safe-parsed with fallbacks so a malformed LLM response never breaks the page. New endpoints: `GET /api/session/:id/report` (poll) and `POST /api/session/:id/report` (retry after a failure). The report page shows the overall score and readiness up top, the SWOT as a 2×2 card grid, per-question cards below, and has a print-friendly stylesheet behind **Download / print report**.

Verify it locally:

1. Complete a short skill interview (2–4 questions), answering with real spoken (or typed) answers.
2. After the last answer you land on "Preparing your evaluation…" — because generation starts at interview end, it should resolve within a few seconds.
3. Check every section renders: overall score + readiness level, all four SWOT quadrants (each point should reference something you actually said), and one card per question with score, feedback, and "How to improve". Skipped questions show score 0.
4. Click **Download / print report** and confirm the print preview is clean (no buttons, white background).
5. Failure path: temporarily put a wrong `GROQ_API_KEY` in `.env`, restart the backend, complete a short interview, and confirm you get the "We hit a snag" screen instead of a dead end. Restore the real key, restart the backend, click **Retry evaluation**, and the report appears.

### Stage 4 — production prep ✅

What exists: a Supabase `SessionStore` behind the same interface (`STORAGE_BACKEND=supabase`), the Railway deploy guide below, and error handling across the app — failed audio uploads keep the clip and offer **Retry upload** (no re-recording), Groq failures return friendly retryable messages, mic denial points to **Type instead**, the report screen retries polling and offers **Retry evaluation**, and the server returns JSON errors even for malformed/oversized uploads. No flow dead-ends.

Verify it locally:

1. `STORAGE_BACKEND=file` (default) still works: run a short interview, see the JSON file in `v2/server/data/sessions/`.
2. Error paths: stop the backend mid-interview and submit an answer — you get an error banner with **Retry upload**; restart the backend, click it, and the interview continues with the same recording.
3. Supabase (optional, needs a free project): create the `sessions` table with the SQL below, set `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env`, restart, run a short interview, and see the row appear in the Supabase table editor.
4. `npm run lint && npm run build` pass in both `v2/server` and `v2/web`.

---

## Deploy to Railway

Two Railway services from this one repo — **no GPU and no Python service are needed** (STT/LLM are Groq API calls; TTS runs in the visitor's browser).

### 0. One-time: Supabase table

In your Supabase project's SQL editor, run:

```sql
create table if not exists sessions (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

(Railway's filesystem is ephemeral, so use `STORAGE_BACKEND=supabase` in production.)

### 1. Backend service (Node)

Railway → **New Project → Deploy from GitHub repo** → pick this repo, then in the service settings:

- **Root directory**: `v2/server`
- **Build command**: `npm install && npm run build`
- **Start command**: `npm start`
- Generate a public domain (Settings → Networking).

Environment variables:

| Variable | Value |
| --- | --- |
| `GROQ_API_KEY` | your key from console.groq.com |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` (or another Groq chat model) |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3` |
| `STORAGE_BACKEND` | `supabase` |
| `SUPABASE_URL` | your project URL (Supabase → Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key (Supabase → Settings → API; keep secret) |

(`PORT` is injected by Railway automatically.)

### 2. Frontend service (static)

Add a second service from the same repo:

- **Root directory**: `v2/web`
- **Build command**: `npm install && npm run build`
- **Start command**: `npx serve -s dist -l $PORT` (or use Railway's static-site option pointing at `dist/`)
- Generate a public domain.

Environment variables:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | the backend service's public URL, e.g. `https://your-backend.up.railway.app` (no trailing slash) |
| `VITE_INTERVIEWER_NAME` | optional, defaults to `Maya` |

Vite reads `VITE_*` variables at **build** time — change them and redeploy the frontend, not just restart it. Pushes to the connected branch auto-deploy both services.
