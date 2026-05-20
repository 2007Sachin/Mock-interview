# Implementation Plan: Voice Onboarding + Voice-First UI

## Overview

Four implementation phases. Each phase must pass `npm run lint` and `npm run build` before commit.

---

## Phase 1 — Interview Device Onboarding

**Branch:** `claude/setup-superpowers-workflow-PMviT`  
**Commit:** `feat: add interview device onboarding`

### Files to Create

- `src/hooks/useDeviceReadiness.ts`
- `src/components/InterviewOnboarding.tsx`

### Files to Modify

- `src/pages/InterviewRoom.tsx` — gate panels behind onboarding

### useDeviceReadiness.ts

State machine hook:
- `state`: `idle | requesting_permissions | mic_ready | camera_ready | speaker_test_pending | speaker_test_passed | ready | failed`
- `micAllowed`: boolean
- `cameraAllowed`: boolean
- `cameraStream`: MediaStream | null
- `micLevel`: number (0–100)
- `speakerTestPassed`: boolean
- `browserSupport`: { mediaDevices, getUserMedia, audioContext, speechSynthesis, speechRecognition }
- `errors`: Record<string, string>
- `requestPermissions()`: calls getUserMedia for audio + video
- `runSpeakerTest()`: plays 440hz tone via AudioContext for 0.5s
- `markReady()`: sets state to `ready`
- `retry()`: resets to `idle`

Mic level uses Web Audio AnalyserNode attached to mic stream. Polls with requestAnimationFrame.

### InterviewOnboarding.tsx

Props: `{ onComplete: () => void }`

Renders four steps:
1. Microphone — request, show level meter, show denied instructions
2. Camera — request, show preview, allow skip with warning
3. Speaker — play test tone button, confirm heard
4. Service — show "Browser fallback ready" or call readiness endpoint if Pipecat mode

`Start Interview` button only enabled when state === `ready`.

### InterviewRoom.tsx changes

Add `onboardingComplete` state (useState). If false, render `<InterviewOnboarding onComplete={() => setOnboardingComplete(true)} />`. If true, render the existing panels.

Do NOT auto-start VoiceAgentPanel speech before onboarding. The existing `useEffect` that calls `voice.speakQuestion()` in VoiceAgentPanel should wait until the panel is mounted (which only happens after onboarding).

---

## Phase 2 — Voice-First Interview UI

**Commit:** `feat: make interview room voice first`

### Files to Modify

- `src/components/VoiceAgentPanel.tsx`
- `src/components/PipecatVoicePanel.tsx`

### VoiceAgentPanel changes

- Add `isOpen` state for fallback drawer (default false).
- Move textarea + Submit Answer into `{isOpen && <FallbackDrawer />}`.
- Add toggle button: "Having trouble? Use text fallback".
- Add assistant bubble: shows `question` prop.
- Add speaking/listening state indicators (animated pulse dots).
- Add live transcript display (read-only, auto-scroll).
- Keep existing button controls (Replay Question, Start Speaking, Stop) but reorder for voice-first flow.

### PipecatVoicePanel changes

- Move manual answer textarea + Submit Manual Answer into collapsed drawer.
- Promote user speaking / bot thinking / bot speaking indicators to top of panel.
- Move Kokoro status + connection status to collapsible debug section at bottom.
- Add assistant message bubble showing `currentQuestion`.

---

## Phase 3 — Interview Readiness Endpoint

**Commit:** `feat: add interview readiness endpoint`

### Files to Modify

- `server/routes/interviewSessions.ts`

### New endpoint

`GET /api/interview-sessions/:sessionId/readiness`

Auth: Bearer token (session token, same as other session routes).

Response:
```json
{
  "sessionId": "...",
  "voiceProvider": "browser",
  "transport": "websocket",
  "requiresMic": true,
  "requiresCamera": true,
  "ttsProvider": "browser_speech",
  "sttProvider": "browser",
  "serverTime": "2026-05-20T...",
  "status": "ready"
}
```

Reads env vars: `VOICE_TRANSPORT`, `VITE_VOICE_AGENT_PROVIDER` (via server env mirror), etc.  
Does NOT return secrets, resume text, JD.

---

## Phase 4 — Pipecat Deployment Plan

**Commit:** `docs: plan pipecat production deployment`

### Files to Create

- `docs/superpowers/specs/pipecat-production-deploy.md` ✓ (already done)
- `docs/superpowers/plans/pipecat-production-deploy-plan.md`

No code changes in this phase.

---

## Validation After Each Phase

```bash
npm run lint
npm run build
```

If tests exist:
```bash
node --import tsx --test test/report-generation.test.ts
```

---

## Production Blockers (Not in this PR)

- Railway Postgres attachment
- Python voice-agent Railway deployment  
- Real STT/VAD
- Reconnect handling
- LMS callback retries
- Rate limiting and CORS hardening
- Dev secrets rotation
- Monitoring and logging
- Privacy disclosure for mic/camera
