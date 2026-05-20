# Plan: Pipecat Production Railway Deployment

## Decision: Option A — Two Railway Services

Node service and Python voice-agent run as separate Railway services sharing Postgres.

---

## Step 1 — Add Railway Postgres

1. Open Railway project dashboard.
2. Add a new Postgres plugin/service.
3. Copy `DATABASE_URL` from Railway Postgres into Node service environment.
4. Run schema: `psql $DATABASE_URL < server/db/schema.sql`
5. Verify health endpoint returns `storageMode: "postgres"`.

---

## Step 2 — Deploy Python Voice-Agent as Separate Railway Service

1. Create a new Railway service from the `services/voice-agent/` subdirectory.
2. Set Railway root directory to `services/voice-agent/`.
3. Railway will detect Python via `pyproject.toml` or `requirements.txt`.
4. Set environment variables on the voice-agent service (see spec).
5. Set `NODE_API_BASE_URL` to the Node service's Railway public URL.
6. Set `PIPECAT_CONNECT_SECRET` to a strong random secret (same value as Node service).
7. Verify `/health` returns:
   ```json
   {
     "success": true,
     "data": {
       "service": "lumina-voice-agent-service",
       "status": "ok"
     }
   }
   ```

---

## Step 3 — Configure Node Service for Pipecat Mode

1. Set `PIPECAT_SERVICE_URL` to the voice-agent Railway public URL.
2. Set `PIPECAT_CONNECT_SECRET` (same as voice-agent).
3. Set `VOICE_TRANSPORT` to `websocket` (or `daily` if Daily is configured).
4. Keep `LLM_PROVIDER=mistral` and set `MISTRAL_API_KEY`.

---

## Step 4 — Configure React Frontend Vite Build

These are build-time env vars for Railway Vite build:

```
VITE_VOICE_AGENT_PROVIDER=pipecat
VITE_TTS_PROVIDER=kokoro
VITE_VOICE_TRANSPORT=websocket
VITE_MOCK_INTERVIEW_API_URL=https://<node-service-railway-url>
VITE_KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX
VITE_KOKORO_DTYPE=q8
VITE_KOKORO_DEVICE=wasm
VITE_KOKORO_VOICE=af_heart
```

---

## Step 5 — Smoke Test Full Flow

```bash
# 1. Create session
curl -X POST https://<node-url>/api/interview-sessions \
  -H "Content-Type: application/json" \
  -H "x-service-secret: <secret>" \
  -d '{ "source": "pathwisse-lms", ... }'

# 2. Verify interview link opens React app
open "https://<node-url>/interview/<sessionId>"

# 3. Enter access code
# 4. Onboarding screen appears
# 5. Grant mic/camera
# 6. Speaker test
# 7. Click Start Interview
# 8. Pipecat connects
# 9. Assistant speaks
# 10. Candidate answers by voice
# 11. Report generated
# 12. Callback sent to LMS
```

---

## Step 6 — Rotate Dev Secrets

Before exposing to external users:
- Rotate `MOCK_INTERVIEW_SERVICE_SECRET`
- Rotate `MOCK_INTERVIEW_CALLBACK_SECRET`
- Rotate `PIPECAT_CONNECT_SECRET`
- Rotate `MISTRAL_API_KEY` (use production key, not dev)

---

## Step 7 — CORS Hardening

In Node service, replace `app.use(cors())` with:
```ts
app.use(cors({
  origin: [
    'https://lms.pathwisse.com',
    'https://<railway-node-url>',
  ],
  credentials: true,
}));
```

---

## Step 8 — Rate Limiting

Add rate limiting on `/api/interview-sessions/:sessionId/verify`:
- Max 5 attempts per sessionId per 10 minutes
- Return 429 on exceed

---

## Step 9 — Monitoring

- Add structured JSON logging (pino or similar)
- Add Sentry DSN to Node and Python services
- Add Railway uptime check on `/health`

---

## Estimated Timeline

| Step | Effort | Blocker |
|---|---|---|
| Railway Postgres | 30 min | Railway access |
| Python voice-agent deploy | 2–4 hrs | Pipecat deps, pyproject.toml |
| Node Pipecat config | 1 hr | Pipecat URL from step 2 |
| Vite rebuild with Pipecat vars | 30 min | Railway Vite env |
| Smoke test | 1 hr | All above |
| Secret rotation | 30 min | |
| CORS hardening | 1 hr | LMS origin URL |
| Rate limiting | 2 hrs | |
| Monitoring | 2–4 hrs | Sentry account |

Total estimated: ~2–3 developer days
