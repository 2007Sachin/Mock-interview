export type InterviewMode = 'resume' | 'capstone' | 'skill';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type BriefCreateResponse = {
  sessionId: string;
  accessCode: string;
  expiresAt: string;
};

export type ResumeBriefInput = {
  mode: 'resume';
  resumeText: string;
  jobTitle: string;
  company?: string;
  jobDescription: string;
};

export type CapstoneBriefInput = {
  mode: 'capstone';
  pdf: File;
};

export type SkillBriefInput = {
  mode: 'skill';
  skillName: string;
  level?: SkillLevel;
};

export type BriefCreateInput = ResumeBriefInput | CapstoneBriefInput | SkillBriefInput;

export type InterviewSessionStatus =
  | 'created'
  | 'opened'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'failed';

export interface SessionVerifyResponse {
  valid: boolean;
  sessionToken: string;
  expiresIn: number;
}

export interface InterviewSessionContext {
  sessionId: string;
  candidateName: string;
  roleTitle: string;
  company: string;
  stages: string[];
  /** Length of the brief's questionBank, when a brief exists for the session. */
  totalQuestions?: number | null;
  status: InterviewSessionStatus;
}

export interface NextQuestionResponse {
  stage: string;
  question: string;
  questionNumber: number;
  totalQuestionsInStage: number;
}

export type PipecatTransportType = 'websocket' | 'daily';

export type InterviewProviderMetadata = {
  sttProvider: string;
  sttModel: string;
  llmProvider: string;
  llmModel: string;
  ttsProvider: string;
  ttsModel: string;
};

export type PipecatConnectionStatus =
  | 'idle'
  | 'disconnected'
  | 'initializing'
  | 'initialized'
  | 'authenticating'
  | 'authenticated'
  | 'connecting'
  | 'connected'
  | 'ready'
  | 'disconnecting'
  | 'error';

type InterviewVoiceConnectPayloadBase = {
  sessionId: string;
  candidateName: string;
  roleTitle: string;
  company: string;
  stages: string[];
  transport: PipecatTransportType;
  currentStage?: string | null;
  currentQuestion?: string | null;
};

export type WebsocketInterviewVoiceConnectPayload = InterviewVoiceConnectPayloadBase & {
  transport: 'websocket';
  voiceToken: string;
  pipecatConnectUrl: string;
};

export type DailyInterviewVoiceConnectPayload = InterviewVoiceConnectPayloadBase & {
  transport: 'daily';
  connectParams: Record<string, unknown> | null;
  setupError: string | null;
};

export type InterviewVoiceConnectPayload =
  | WebsocketInterviewVoiceConnectPayload
  | DailyInterviewVoiceConnectPayload;

type PipecatBrowserEventBase = {
  type: string;
  eventId: string;
  sessionId: string;
  createdAt: string;
};

export type UserInterimTranscriptEvent = PipecatBrowserEventBase & {
  type: 'user_interim_transcript';
  stage: string;
  text: string;
  sttProvider: string;
  sttModel: string;
};

export type UserFinalTranscriptEvent = PipecatBrowserEventBase & {
  type: 'user_final_transcript';
  turnId: string;
  stage: string;
  question: string;
  text: string;
  sttProvider: string;
  sttModel: string;
};

export type AssistantTextEvent = PipecatBrowserEventBase & {
  type: 'assistant_text';
  turnId: string;
  stage: string;
  question: string;
  text: string;
  llmProvider: string;
  llmModel: string;
  ttsProvider: string;
};

export type BotThinkingEvent = {
  type: 'bot_thinking';
  sessionId: string;
  isThinking: boolean;
};

export type PipecatErrorEvent = PipecatBrowserEventBase & {
  type: 'error';
  code: string;
  message: string;
};

export type InterviewCompleteEvent = PipecatBrowserEventBase & {
  type: 'interview_complete';
};

export type PipecatBrowserEvent =
  | UserInterimTranscriptEvent
  | UserFinalTranscriptEvent
  | AssistantTextEvent
  | BotThinkingEvent
  | PipecatErrorEvent
  | InterviewCompleteEvent;

export interface QuestionEvaluation {
  question: string;
  answerSummary: string;
  score: number;
  feedback: string;
  improvement: string;
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
  questionEvaluations?: QuestionEvaluation[];
  status: InterviewSessionStatus;
}
