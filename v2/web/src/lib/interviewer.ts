/** The interviewer's display name; override with VITE_INTERVIEWER_NAME. */
export const INTERVIEWER_NAME: string = import.meta.env.VITE_INTERVIEWER_NAME || 'Maya';

export function introLine(interviewTitle: string): string {
  return `Hi, I'm ${INTERVIEWER_NAME}, and I'll be your interviewer today. We'll be talking about ${interviewTitle}. Take your time with each answer — when you're ready, let's begin.`;
}
