import {
  BriefCreateInput,
  BriefCreateResponse,
  InterviewReport,
  InterviewSessionContext,
  InterviewVoiceConnectPayload,
  NextQuestionResponse,
  SessionVerifyResponse,
} from '@/types/interview';
import { env } from '@/lib/env';

function getApiBaseUrl() {
  const configuredBaseUrl = (import.meta.env.VITE_MOCK_INTERVIEW_API_URL as string | undefined)?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }

  return '';
}

const apiBaseUrl = getApiBaseUrl();

function getHeaders(sessionToken?: string): HeadersInit {
  const headers: HeadersInit = {
    'content-type': 'application/json',
  };

  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  return headers;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const rawBody = await response.text();
  const hasBody = rawBody.trim().length > 0;
  let payload: unknown = null;

  if (hasBody) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      if (response.ok) {
        throw new Error(`Received a malformed JSON response from ${path}.`);
      }
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : 'Request failed.';
    throw new ApiRequestError(message, response.status, path);
  }

  if (!hasBody || payload === null) {
    throw new Error(`Received an empty JSON response from ${path}.`);
  }

  return payload as T;
}

export function verifyInterviewSession(sessionId: string, accessCode: string) {
  return request<SessionVerifyResponse>(`/api/interview-sessions/${sessionId}/verify`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ accessCode }),
  });
}

export function getInterviewSession(sessionId: string, sessionToken: string) {
  return request<InterviewSessionContext>(`/api/interview-sessions/${sessionId}`, {
    headers: getHeaders(sessionToken),
  });
}

export function getNextQuestion(
  sessionId: string,
  sessionToken: string,
  stage: string,
  previousAnswers: string[],
) {
  return request<NextQuestionResponse>(`/api/interview-sessions/${sessionId}/questions/next`, {
    method: 'POST',
    headers: getHeaders(sessionToken),
    body: JSON.stringify({ stage, previousAnswers }),
  });
}

export function submitInterviewAnswer(
  sessionId: string,
  sessionToken: string,
  input: {
    stage: string;
    question: string;
    answerTranscript: string;
    audioUrl: string | null;
  },
) {
  return request<{ ok: true }>(`/api/interview-sessions/${sessionId}/answers`, {
    method: 'POST',
    headers: getHeaders(sessionToken),
    body: JSON.stringify(input),
  });
}

export function completeInterview(sessionId: string, sessionToken: string) {
  return request<InterviewReport>(`/api/interview-sessions/${sessionId}/complete`, {
    method: 'POST',
    headers: getHeaders(sessionToken),
  });
}

export function getInterviewReport(sessionId: string, sessionToken: string) {
  return request<InterviewReport>(`/api/interview-sessions/${sessionId}/report`, {
    headers: getHeaders(sessionToken),
  });
}

export function connectInterviewVoice(sessionId: string, sessionToken: string) {
  return request<InterviewVoiceConnectPayload>(`/api/interview-sessions/${sessionId}/voice/connect`, {
    method: 'POST',
    headers: getHeaders(sessionToken),
  });
}

export function createInterviewBrief(input: BriefCreateInput): Promise<BriefCreateResponse> {
  if (input.mode === 'capstone') {
    const formData = new FormData();
    formData.append('mode', 'capstone');
    formData.append('pdf', input.pdf);

    // No content-type header: the browser sets the multipart boundary itself.
    return request<BriefCreateResponse>('/api/interview-briefs', {
      method: 'POST',
      headers: { 'x-service-secret': env.serviceSecret },
      body: formData,
    });
  }

  return request<BriefCreateResponse>('/api/interview-briefs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-service-secret': env.serviceSecret },
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Pending report handoff
// ---------------------------------------------------------------------------
// The wrap-up screen kicks off report generation and navigates to the report
// page without waiting for it. The promise is parked here (settled entries
// included, so a remount reuses the result without refetching); the report
// page attaches its own handlers and shows a generating state until it
// settles. On a hard refresh the cache is empty and the page falls back to
// GET /report.

const pendingReports = new Map<string, Promise<InterviewReport>>();

function trackInterviewCompletion(sessionId: string, sessionToken: string): Promise<InterviewReport> {
  const pending = completeInterview(sessionId, sessionToken);
  // Callers may not await this (the wrap-up screen never does); swallow to
  // avoid an unhandled rejection. The report page attaches real handlers.
  pending.catch(() => undefined);
  pendingReports.set(sessionId, pending);
  return pending;
}

export function startInterviewCompletion(sessionId: string, sessionToken: string): Promise<InterviewReport> {
  return pendingReports.get(sessionId) ?? trackInterviewCompletion(sessionId, sessionToken);
}

/** Re-runs completion after a failure, replacing the cached promise. */
export function retryInterviewCompletion(sessionId: string, sessionToken: string): Promise<InterviewReport> {
  return trackInterviewCompletion(sessionId, sessionToken);
}

export function takePendingReport(sessionId: string): Promise<InterviewReport> | null {
  return pendingReports.get(sessionId) ?? null;
}
