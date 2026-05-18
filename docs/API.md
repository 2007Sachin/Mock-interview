# API Contracts

## Career Engine

### `GET /health`

Returns service health, plugin count, and skill count.

The Voice Agent runtime is a real Pipecat pipeline using Whisper, Mistral, and Kokoro. `MISTRAL_API_KEY`, Redis, and local Whisper/Kokoro model dependencies are required.

### `GET /v1/capabilities`

Returns plugin registry entries, available actions, and injected skills.

### `GET /v1/students/:studentId/job-matches`

Returns starter role matches for a student.

### `POST /v1/mock-interviews`

Creates a staged mock interview.

### `GET /v1/mock-interviews/:mockInterviewId`

Returns mock interview metadata without access-code hash or full bootstrap.

### `GET /v1/students/:studentId/mock-interviews`

Returns student interview list.

### `POST /v1/mock-interviews/:mockInterviewId/validate-access-code`

Validates the visible access code and returns:

- `voice_session_id`
- `voice_session_token`
- signed `bootstrap`
- realtime transport metadata

Invalid attempts are rate-limited per interview and client address. Successful validation clears the local attempt budget.

### Callback Endpoints

- `POST /v1/mock-interviews/:mockInterviewId/stage-events`
- `POST /v1/mock-interviews/:mockInterviewId/transcript-events`
- `POST /v1/mock-interviews/:mockInterviewId/workspace-submissions`
- `POST /v1/mock-interviews/:mockInterviewId/final-report`
- `GET /v1/mock-interviews/:mockInterviewId/report`

Runtime callback writes must include:

- `x-mi-timestamp`: ISO timestamp within the five-minute replay window.
- `x-mi-signature`: HMAC-SHA256 over `timestamp.stableJson(payload)` using `HMAC_SHARED_SECRET`.

Career Engine rejects unsigned callbacks and callbacks whose interview/attempt ids do not match the target record.

## Voice Agent

### `POST /v1/sessions/validate-access-code`

Proxy-validates the access code with Career Engine and hydrates the voice runtime.

### `POST /v1/sessions/bootstrap`

Returns the active bootstrap payload for a valid voice session token.

### `POST /v1/sessions/:voiceSessionId/reconnect`

Validates the voice session token and returns the current stage snapshot, question count, workspace flags, stage scores, and progress data for reconnect recovery.

### `WS /v1/realtime/:voiceSessionId?token=<voice_session_token>`

Realtime Pipecat websocket transport. The token is a signed JWT issued after access-code validation. The browser should connect through `@pipecat-ai/client-js` and `@pipecat-ai/websocket-transport`, not raw typed text messages.

Frontend sends workspace submissions through RTVI UI events:

```json
{ "type": "ui-event", "data": { "event": "workspace_submitted", "payload": { "stage_id": "stage_3", "workspace_type": "coding", "code": "..." } } }
```

Server UI commands are emitted via RTVI: `interview_started`, `transcript_update`, `transcript_restore`, `stage_progress`, `open_workspace`, `close_workspace`, `workspace_state_sync`, `scoring_complete`, and `interview_completed`.
