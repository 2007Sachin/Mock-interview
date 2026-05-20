# Spec: Voice-First Interview Room UI

**Status:** Active  
**Phase:** 2 of N  

## Problem

The current `VoiceAgentPanel` and `PipecatVoicePanel` look like form-based UIs: large textarea, Submit Answer button, manual speaking controls. This is appropriate for smoke testing but must be replaced with a voice-first conversation layout for production.

## Required Layout (Voice-First)

```
┌─────────────────────────────────────────┐
│  Assistant bubble (current question/msg) │
│  [Speaking... / Listening... indicator]  │
├─────────────────────────────────────────┤
│  Live transcript (user speaking)         │
│  [Interim + final transcript display]    │
├─────────────────────────────────────────┤
│  Stage progress                          │
├─────────────────────────────────────────┤
│  [ ▼ Having trouble? Use text fallback ] │ ← collapsed by default
└─────────────────────────────────────────┘
```

## Changes to VoiceAgentPanel

- Remove always-visible large textarea from primary view.
- Remove Submit Answer as the primary action.
- Add assistant message bubble (reads from current question prop).
- Add `isSpeaking` and `isListening` state indicators (animated dots or icons).
- Add live transcript display area (auto-scrolling).
- Add collapsed fallback drawer ("Having trouble? Use text fallback").
- Fallback drawer: contains textarea + Submit Answer (unchanged internally).
- In browser fallback mode, Submit Answer still required technically, but hidden behind drawer.

## Changes to PipecatVoicePanel

- Same layout restructuring as VoiceAgentPanel.
- Manual answer textarea moves into collapsed fallback drawer.
- Status indicators (user speaking / bot thinking / bot speaking) promoted to main view.
- Connection status and Kokoro status moved to a small status footer or collapsible debug panel.

## Changes to InterviewRoom

- Show onboarding before panels (Phase 1 gates this).
- Pass `onboardingComplete` prop to condition panel rendering.

## Acceptance Criteria

- Default UI shows conversation layout, not a form.
- Typing box is collapsed behind fallback drawer.
- Status indicators are prominent.
- Browser fallback smoke tests still work.
- `npm run lint` passes.
- `npm run build` passes.
