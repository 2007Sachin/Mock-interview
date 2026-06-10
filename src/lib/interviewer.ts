import { env } from '@/lib/env';

/** The AI interviewer's display name (override with VITE_INTERVIEWER_NAME). */
export const INTERVIEWER_NAME = env.interviewerName;

/** Approximate interview length shown on the briefing screen. */
export const INTERVIEW_LENGTH_MINUTES = 7;

export function buildIntroLine(topic: string) {
  const subject = topic.trim() || 'your chosen topic';
  return `Hi, I'm ${INTERVIEWER_NAME}. I'll be interviewing you on ${subject} today. Ready when you are.`;
}

export function buildClosingLine() {
  return "That's everything from me — preparing your report now.";
}
