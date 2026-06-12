export type Mode = 'resume' | 'capstone' | 'skill';

export interface Brief {
  title: string;
  summary: string;
  focusAreas: string[];
  questionBank: string[];
  rubric: string[];
}

export interface Session {
  id: string;
  mode: Mode;
  createdAt: string;
  brief: Brief;
  currentQuestion: number;
  turns: { question: string; answer?: string; answeredVia?: 'voice' | 'text'; skipped?: boolean }[];
  status: 'active' | 'ended';
}

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
    readinessLevel: 'needs practice' | 'getting there' | 'interview ready';
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

export interface AnswerResult {
  transcript: string;
  done: boolean;
  nextQuestion: string | null;
  index: number;
  total: number;
}
