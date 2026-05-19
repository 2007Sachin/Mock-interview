export type InterviewSessionStatus =
  | 'created'
  | 'opened'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'failed';

export type VoiceTransport = 'websocket' | 'daily';

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

export interface VoiceConnectTokenClaims {
  sessionId: string;
  transport: VoiceTransport;
  nonce: string;
  iat: number;
  exp: number;
}

export interface SignedVoiceConnectToken {
  token: string;
  claims: VoiceConnectTokenClaims;
}

export interface InterviewVoiceConnectPayload {
  sessionId: string;
  candidateName: string;
  roleTitle: string;
  company: string;
  stages: string[];
  voiceToken: string;
  pipecatConnectUrl: string;
  transport: VoiceTransport;
}

export interface InternalInterviewVoiceContext {
  sessionId: string;
  status: InterviewSessionStatus;
  transport: VoiceTransport;
  requestId: string;
  candidate: InterviewPayload['user'];
  opportunity: InterviewPayload['opportunity'];
  resume: InterviewPayload['resume'];
  interviewConfig: InterviewPayload['interviewConfig'];
  answers: Array<{
    stage: string;
    question: string;
    answerTranscript: string;
    audioUrl: string | null;
    createdAt: string;
  }>;
}

export interface InterviewTranscriptEventInput {
  type: string;
  eventId?: string;
  turnId?: string;
  stage?: string;
  question?: string;
  text?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface InterviewTurnInput {
  turnId?: string;
  stage?: string;
  question?: string;
  input: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PlaceholderRouteResult {
  status: 501;
  body: {
    code: string;
    message: string;
  };
}
