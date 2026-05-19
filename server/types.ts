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

export type InterviewReportDraft = Omit<InterviewReportRecord, 'id' | 'createdAt' | 'sessionId'>;

export type InterviewTurnRole = 'user' | 'assistant';

export type TranscriptEventRole = 'user' | 'assistant' | 'system';

export type TranscriptEventType =
  | 'user_interim_transcript'
  | 'user_final_transcript'
  | 'assistant_text'
  | 'error'
  | 'interview_complete';

export interface InterviewTurnRecord {
  id: string;
  sessionId: string;
  turnId: string;
  role: InterviewTurnRole;
  stage: string | null;
  question: string | null;
  text: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface InterviewTranscriptEventRecord {
  id: string;
  sessionId: string;
  eventId: string;
  turnId: string | null;
  role: TranscriptEventRole;
  type: TranscriptEventType;
  stage: string | null;
  question: string | null;
  text: string | null;
  metadata: Record<string, unknown>;
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

export interface InterviewVoiceConnectPayloadBase {
  sessionId: string;
  candidateName: string;
  roleTitle: string;
  company: string;
  stages: string[];
  transport: VoiceTransport;
  currentStage: string | null;
  currentQuestion: string | null;
}

export interface DailyTransportConnectParams {
  url: string;
  token: string;
}

export interface WebsocketInterviewVoiceConnectPayload extends InterviewVoiceConnectPayloadBase {
  transport: 'websocket';
  voiceToken: string;
  pipecatConnectUrl: string;
}

export interface DailyInterviewVoiceConnectPayload extends InterviewVoiceConnectPayloadBase {
  transport: 'daily';
  connectParams: DailyTransportConnectParams | null;
  setupError: string | null;
}

export type InterviewVoiceConnectPayload =
  | WebsocketInterviewVoiceConnectPayload
  | DailyInterviewVoiceConnectPayload;

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
  type: TranscriptEventType;
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
  role?: InterviewTurnRole;
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
