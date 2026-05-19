import {
  InterviewReport,
  InterviewSessionContext,
  NextQuestionResponse,
  SessionVerifyResponse,
} from '@/types/interview';

const apiBaseUrl = (import.meta.env.VITE_MOCK_INTERVIEW_API_URL as string | undefined) ?? 'http://localhost:4174';

function getHeaders(sessionToken?: string): HeadersInit {
  const headers: HeadersInit = {
    'content-type': 'application/json',
  };

  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : 'Request failed.';
    throw new Error(message);
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
