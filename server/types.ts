export type InterviewSessionStatus =
  | 'created'
  | 'opened'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'failed';

export interface InterviewPayload {
  source: 'pathwisse-lms';
  requestId: string;
  user: {
    id: string;
    name: string;
    email: string;
    organizationId: string | null;
  };
  opportunity: {
    id: string;
    matchId: string;
    title: string;
    company: string;
    location: string | null;
    description: string;
    matchedSkills: string[];
    missingSkills: string[];
    recommendedActions: string[];
  };
  resume: {
    resumeId: string | null;
    text: string;
    fileName: string | null;
  };
  interviewConfig: {
    mode: 'voice';
    difficulty: 'entry_level';
    durationMinutes: number;
    stages: string[];
  };
  callback: {
    reportWebhookUrl: string;
  };
}

export interface InterviewSessionRecord {
  id: string;
  userId: string;
  organizationId: string | null;
  opportunityId: string;
  accessCodeHash: string;
  status: InterviewSessionStatus;
  payload: InterviewPayload;
  callbackUrl: string;
  sessionTokenHash: string | null;
  attemptCount: number;
  lockedUntil: string | null;
  expiresAt: string;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface InterviewAnswerRecord {
  id: string;
  sessionId: string;
  stage: string;
  question: string;
  answerTranscript: string;
  audioUrl: string | null;
  score: number | null;
  feedback: string | null;
  createdAt: string;
}

export interface InterviewReportRecord {
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
  createdAt: string;
}
