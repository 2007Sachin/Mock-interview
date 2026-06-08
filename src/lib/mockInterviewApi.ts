import {
  BriefCreateInput,
  BriefCreateResponse,
  InterviewReport,
  InterviewSessionContext,
  InterviewVoiceConnectPayload,
  ManualInterviewTurnInput,
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

export function submitManualInterviewTurn(sessionId: string, sessionToken: string, input: ManualInterviewTurnInput) {
  return request<{ ok: true }>(`/api/interview-sessions/${sessionId}/voice/manual-turn`, {
    method: 'POST',
    headers: getHeaders(sessionToken),
    body: JSON.stringify(input),
  });
}

export async function createInterviewBrief(input: BriefCreateInput): Promise<BriefCreateResponse> {
  const secret = env.serviceSecret;

  if (input.mode === 'capstone') {
    const formData = new FormData();
    formData.append('mode', 'capstone');
    formData.append('pdf', input.pdf);

    const response = await fetch(`${apiBaseUrl}/api/interview-briefs`, {
      method: 'POST',
      headers: { 'x-service-secret': secret },
      body: formData,
    });

    const rawBody = await response.text();
    let payload: unknown = null;
    try { payload = JSON.parse(rawBody); } catch { /* empty */ }

    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload !== null && 'message' in payload && typeof (payload as Record<string, unknown>).message === 'string'
          ? (payload as Record<string, unknown>).message as string
          : 'Failed to create capstone session.';
      throw new ApiRequestError(message, response.status, '/api/interview-briefs');
    }

    return payload as BriefCreateResponse;
  }

  return request<BriefCreateResponse>('/api/interview-briefs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-service-secret': secret },
    body: JSON.stringify(input),
  });
}
