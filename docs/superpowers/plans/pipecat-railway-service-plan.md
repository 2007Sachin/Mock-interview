# Pipecat Railway Service — Deployment Plan

## Goal

Deploy the Python Pipecat voice-agent as a second Railway service from the same GitHub repo (`MahammadWahab540/pathwisse-mockinterview`), using `services/voice-agent` as the root directory. The Node/React service continues to run at `/` as service 1.

## Phase 0 — Repo readiness (this PR)

- [x] Verify `services/voice-agent/app/main.py` — FastAPI entrypoint `app.main:app`
- [x] Verify `/health` route returns correct shape
- [x] Verify `/v1/realtime/{session_id}` WebSocket route exists
- [x] Verify all env vars are read via `pydantic-settings` (config.py)
- [x] Verify Node `createVoiceConnectPayload` builds correct `wss://` URL from `PIPECAT_SERVICE_URL`
- [x] Verify browser `usePipecatInterview` appends `?token=` correctly
- [x] Verify Python validates token with `validate_voice_connect_token()`
- [x] Verify Python fetches context via `x-pipecat-secret` header
- [x] Add `services/voice-agent/railway.json` — start command + health check path
- [x] Update `services/voice-agent/README.md` — Railway deploy section
- [x] Update `services/voice-agent/.env.example` — annotated production template
- [x] Add `docs/superpowers/specs/pipecat-railway-service.md`
- [x] Add `docs/superpowers/plans/pipecat-railway-service-plan.md`
- [x] Run `npm run lint` and `npm run build` — pass
- [x] Run `python -m compileall app` in `services/voice-agent` — pass

## Phase 1 — Create Railway voice-agent service

Steps performed in Railway dashboard:

1. Click "New Service" → "GitHub Repo" → select `MahammadWahab540/pathwisse-mockinterview`.
2. Set root directory to `services/voice-agent`.
3. Railway/Nixpacks detects `pyproject.toml` and installs with `uv`.
4. If start command is not picked up from `railway.json`, set manually:
   ```
   uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
5. Rename service to `pathwisse-voice-agent`.
6. Set environment variables (see Task E in spec).
7. Deploy. Wait for build and health check.

## Phase 2 — Smoke test the Python service

```bash
curl https://<voice-agent-railway-domain>/health
# Expected:
# { "success": true, "data": { "service": "lumina-voice-agent-service", "status": "ok" } }
```

Check Railway logs for any startup errors (missing env, import failures).

## Phase 3 — Wire Node service to Python service

In the Node/React Railway service:

1. Add `PIPECAT_SERVICE_URL=https://<voice-agent-railway-domain>`.
2. Confirm `PIPECAT_CONNECT_SECRET` matches Python service.
3. Set `VOICE_AGENT_PROVIDER=pipecat` and `VOICE_TRANSPORT=websocket`.
4. Set `VITE_VOICE_AGENT_PROVIDER=pipecat` and `VITE_TTS_PROVIDER=kokoro`.
5. Trigger a redeploy (Vite rebuild required for `VITE_*` vars).

## Phase 4 — End-to-end smoke test

1. Create a new interview session.
2. Open the interview link and enter the access code.
3. Complete onboarding (mic permission required).
4. Click "Start Interview" in the Pipecat panel.
5. Confirm connection status changes to `connected`.
6. Confirm the opening question appears in the assistant bubble.
7. Confirm Kokoro speaks the question text.
8. Speak a response — confirm transcript appears.
9. Confirm assistant reply appears and is spoken.
10. Open Railway logs for the Python service — confirm no errors.
11. Open Railway logs for the Node service — confirm transcript-events and turns persist.

## Phase 5 — Production hardening (future)

- [ ] Narrow CORS `allow_origins` in Python service to the Node/React public URL.
- [ ] Rotate `PIPECAT_CONNECT_SECRET` to a strong random value (not `dev-pipecat-secret`).
- [ ] Enable `LLM_PROVIDER=mistral` with a real key on Node for authoritative report generation.
- [ ] Add Railway Postgres and point `DATABASE_URL` on Node service.
- [ ] Add WebSocket reconnect logic in `usePipecatInterview`.
- [ ] Monitor Railway metrics — scale Python service replicas for concurrent sessions.
- [ ] Validate full Pipecat STT pipeline (mic → VAD → Whisper → transcript events).

## Validation commands

### Node service

```bash
npm run lint
npm run build
node --import tsx --test test/report-generation.test.ts
```

### Python service

```bash
cd services/voice-agent
python -m compileall app

# If uv is available:
uv run python -c "import app.main; print('voice-agent import ok')"

# If uvicorn is practical:
uv run uvicorn app.main:app --host 127.0.0.1 --port 7860 &
curl http://127.0.0.1:7860/health
```

## Files changed in this PR

| File | Change |
|------|--------|
| `services/voice-agent/railway.json` | Added — Railway start command + health check |
| `services/voice-agent/README.md` | Updated — Railway deploy section added |
| `services/voice-agent/.env.example` | Updated — annotated production template |
| `docs/superpowers/specs/pipecat-railway-service.md` | Added — full deployment spec |
| `docs/superpowers/plans/pipecat-railway-service-plan.md` | Added — this plan |
