# Spec: Voice Interview Onboarding

**Status:** Active  
**Phase:** 1 of N  

## Problem

The deployed Railway app loads the interview room immediately after access-code validation and shows manual speaking controls with a large text area. This is not a voice-first interview product experience.

Before the interview starts, the candidate must:
- grant microphone permission
- grant camera permission (optional or required per config)
- see a camera preview so they know they look acceptable
- see a mic level meter confirming audio is being captured
- pass a speaker test confirming they can hear the assistant
- confirm the voice service (or browser fallback) is ready

Only then should the interview panel appear.

## Scope

This spec covers the device onboarding screen inserted between access-code validation and the interview room panels (VoiceAgentPanel for browser fallback, PipecatVoicePanel for Pipecat mode).

Out of scope: Pipecat Railway deployment, Postgres migration, backend report generation, LMS callback hardening.

## User Journey

```
/interview/:sessionId
  → AccessCodePage (enter code)
  → [sessionToken stored in sessionStorage]
  → InterviewRoom renders
    → InterviewOnboarding (NEW)
      → mic permission
      → camera permission
      → camera preview
      → mic level meter
      → speaker test
      → readiness check
      → Start Interview [button]
    → VoiceAgentPanel | PipecatVoicePanel (after onboarding complete)
```

## Required Onboarding States

| State | Description |
|---|---|
| `idle` | Not yet started |
| `requesting_permissions` | getUserMedia called, waiting |
| `mic_ready` | Mic granted, no camera yet |
| `camera_ready` | Both granted |
| `speaker_test_pending` | Waiting for user to test speaker |
| `speaker_test_passed` | Speaker test confirmed |
| `voice_service_checking` | Calling readiness endpoint |
| `ready` | All required checks passed |
| `failed` | One or more required checks failed |

## Required Components

- `src/hooks/useDeviceReadiness.ts` — manages permission state, audio analysis, speaker test
- `src/components/InterviewOnboarding.tsx` — renders the onboarding UI

## Required UX Elements

1. Step indicator (mic / camera / speaker / service)
2. Camera preview `<video>` element (muted, autoplay)
3. Mic level bar (animated using Web Audio AnalyserNode)
4. Speaker test button (plays a short tone via AudioContext oscillator)
5. Per-step status icons (pending / pass / fail)
6. Retry buttons on failure steps
7. Browser-specific mic/camera enable instructions on permission denied
8. "Start Interview" button — disabled until all required checks pass
9. Fallback note: if camera denied, allow skip with warning

## Acceptance Criteria

- Opening `/interview/:sessionId` shows onboarding first.
- User must grant mic permission before `Start Interview` enables.
- Camera preview appears after camera permission granted.
- Mic level meter animates when the user speaks.
- Speaker test button plays a tone.
- `Start Interview` is disabled until required checks pass.
- After clicking `Start Interview`, the interview panel appears (VoiceAgentPanel or PipecatVoicePanel).
- `npm run lint` passes.
- `npm run build` passes.

## Security Constraints

- No secrets passed to frontend during onboarding.
- Readiness endpoint must not return resume text, JD, or private config.
- Camera stream stays local (no recording).
