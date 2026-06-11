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

export interface AnswerResult {
  transcript: string;
  done: boolean;
  nextQuestion: string | null;
  index: number;
  total: number;
}
