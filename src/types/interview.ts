export type InterviewSessionStatus =
  | 'created'
  | 'opened'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'failed';

export interface SessionVerifyResponse {
  valid: true;
  sessionToken: string;
  expiresIn: number;
}

export interface InterviewSessionContext {
  sessionId: string;
  candidateName: string;
  roleTitle: string;
  company: string;
  stages: string[];
  status: InterviewSessionStatus;
}

export interface NextQuestionResponse {
  stage: string;
  question: string;
  questionNumber: number;
  totalQuestionsInStage: number;
}

export interface InterviewReport {
  id: string;
  sessionId: string;
  overallScore: number;
  communicationScore: number | null;
  technicalScore: number | null;
  behavioralScore: number | null;
  jdAlignmentScore: number | null;
  summary: string;
  strengths: string[];
  improvements: string[];
  stageScores: Record<string, number>;
  status: InterviewSessionStatus;
}
