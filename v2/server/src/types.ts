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

export type ReadinessLevel = 'needs practice' | 'getting there' | 'interview ready';

export interface SwotPoint {
  point: string;
  evidence: string;
}

export interface PerQuestionFeedback {
  question: string;
  answerSummary: string;
  score: number;
  feedback: string;
  howToImprove: string;
}

export interface Report {
  overall: {
    score: number;
    summary: string;
    readinessLevel: ReadinessLevel;
  };
  swot: {
    strengths: SwotPoint[];
    weaknesses: SwotPoint[];
    opportunities: SwotPoint[];
    threats: SwotPoint[];
  };
  perQuestion: PerQuestionFeedback[];
}

export type ReportStatus = 'pending' | 'ready' | 'error';

export interface Session {
  id: string;
  mode: Mode;
  createdAt: string;
  brief: Brief;
  /** Index into brief.questionBank of the question currently being asked. */
  currentQuestion: number;
  turns: Turn[];
  status: SessionStatus;
  reportStatus?: ReportStatus;
  report?: Report;
}

/** Shape returned to the client (no internal-only fields today, kept as an alias for clarity). */
export type SessionView = Session;
