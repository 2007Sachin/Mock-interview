import type { AnswerResult, Mode, Report, ReportStatus, Session } from './types';

// Same-origin in dev (Vite proxies /api); set VITE_API_URL for a deployed backend.
const BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export interface CreateSessionInput {
  mode: Mode;
  skill?: string;
  file?: File;
  questionCount?: number;
}

export function createSession(input: CreateSessionInput): Promise<Session> {
  const form = new FormData();
  form.append('mode', input.mode);
  if (input.skill) form.append('skill', input.skill);
  if (input.file) form.append('file', input.file);
  if (input.questionCount) form.append('questionCount', String(input.questionCount));
  return request<Session>('/api/session', { method: 'POST', body: form });
}

export function submitAnswer(sessionId: string, answer: Blob | string): Promise<AnswerResult> {
  const form = new FormData();
  if (typeof answer === 'string') {
    form.append('text', answer);
  } else {
    form.append('audio', answer, 'answer.webm');
  }
  return request<AnswerResult>(`/api/session/${sessionId}/answer`, { method: 'POST', body: form });
}

export function skipQuestion(sessionId: string): Promise<Omit<AnswerResult, 'transcript'>> {
  return request(`/api/session/${sessionId}/skip`, { method: 'POST' });
}

export function endSession(sessionId: string): Promise<{ done: true }> {
  return request(`/api/session/${sessionId}/end`, { method: 'POST' });
}

export function getReport(sessionId: string): Promise<{ status: ReportStatus; report: Report | null }> {
  return request(`/api/session/${sessionId}/report`);
}

export function retryReport(sessionId: string): Promise<{ status: ReportStatus }> {
  return request(`/api/session/${sessionId}/report`, { method: 'POST' });
}
