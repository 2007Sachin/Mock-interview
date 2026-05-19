# Pathwisse Mock Interview

Focused mock interview app/service for the Pathwisse LMS opportunities flow.

## Responsibilities

- Receive full JD/resume/user-context payloads from `pathwisse-career-services`
- Generate access-code gated interview sessions
- Verify access codes with rate limiting
- Run the staged interview flow
- Persist answers and reports
- Send HMAC-signed callbacks back to `pathwisse-career-services`

## Runtime Storage

- **Production path:** PostgreSQL via `DATABASE_URL`
- **Dev-only fallback:** `.data/mock-interview-store.json` when `DATABASE_URL` is missing

The file-backed store is intentionally local-development only and should not be used in production.

## Environment

Copy `.env.example` to `.env` and set:

```env
MOCK_INTERVIEW_PUBLIC_URL=http://localhost:5174
MOCK_INTERVIEW_SERVICE_PORT=4174
MOCK_INTERVIEW_SERVICE_SECRET=dev-secret
MOCK_INTERVIEW_CALLBACK_SECRET=dev-callback-secret
MOCK_INTERVIEW_STORE_PATH=.data/mock-interview-store.json
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pathwisse_mock_interview
SESSION_TOKEN_SECRET=replace-me
AI_PROVIDER_API_KEY=
LLM_PROVIDER=mock
MISTRAL_API_KEY=
MISTRAL_LLM_MODEL=mistral-small-latest
MISTRAL_TEMPERATURE=0.3
MISTRAL_MAX_TOKENS=1200
MISTRAL_TIMEOUT_MS=15000
MISTRAL_RETRY_COUNT=1
VOICE_AGENT_PROVIDER=pipecat
VOICE_TRANSPORT=websocket
PIPECAT_SERVICE_URL=http://localhost:7860
PIPECAT_CONNECT_SECRET=dev-pipecat-secret
PIPECAT_ROOM_PROVIDER=daily
PIPECAT_DAILY_API_KEY=
PIPECAT_DAILY_DOMAIN=
VITE_MOCK_INTERVIEW_API_URL=http://localhost:4174
VITE_VOICE_AGENT_PROVIDER=pipecat
VITE_VOICE_TRANSPORT=websocket
VITE_TTS_PROVIDER=kokoro
```

## Commands

```bash
npm install
npm run dev:server
npm run dev:client
npm run lint
npm run build
```

## Database

Apply the schema from [server/db/schema.sql](</d:/Voiceagent integration stage/V2/pathwisse-mockinterview/server/db/schema.sql>) before using Postgres mode.

## Security Notes

- Full JD/resume payload stays server-side in the mock interview backend only.
- Final report generation can use the Node-owned Mistral path when `LLM_PROVIDER=mistral` and `MISTRAL_API_KEY` is set; otherwise the existing heuristic scorer remains the fallback.
- No JD/resume/PII is sent through URL query params.
- `sessionStorage` stores only the short-lived interview session token.
- Access codes are hashed before persistence.
- Callback payloads are signed with `MOCK_INTERVIEW_CALLBACK_SECRET`.
- The frontend safe-context API returns role/company/stages/status only.
- Mistral, Daily API, and Pipecat secrets stay server-side only.
- Kokoro remains browser-only for assistant playback.

## Voice Transport Modes

- Local/dev default: `VOICE_TRANSPORT=websocket`
- Production path: `VOICE_TRANSPORT=daily`
- Daily mode also requires `PIPECAT_ROOM_PROVIDER=daily`, `PIPECAT_DAILY_API_KEY`, `PIPECAT_DAILY_DOMAIN`, and `PIPECAT_SERVICE_URL`.
- Local websocket mode does not require Daily credentials.
