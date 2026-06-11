export type Mode = 'resume' | 'capstone' | 'skill';

export interface Brief {
  title: string;
  summary: string;
  focusAreas: string[];
  questionBank: string[];
  rubric: string[];
}

export interface Turn {
  question: string;
  answer?: string;
  answeredVia?: 'voice' | 'text';
  skipped?: boolean;
}

export type SessionStatus = 'active' | 'ended';

export interface Session {
  id: string;
  mode: Mode;
  createdAt: string;
  brief: Brief;
  /** Index into brief.questionBank of the question currently being asked. */
  currentQuestion: number;
  turns: Turn[];
  status: SessionStatus;
}

/** Shape returned to the client (no internal-only fields today, kept as an alias for clarity). */
export type SessionView = Session;
