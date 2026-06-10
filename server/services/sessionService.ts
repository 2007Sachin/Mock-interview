import { randomUUID } from 'crypto';
import { SessionStore } from '../db/store.js';
import {
  InterviewAnswerRecord,
  DailyInterviewVoiceConnectPayload,
  DailyTransportConnectParams,
  InterviewBrief,
  InterviewMode,
  InterviewPayload,
  InterviewReportDraft,
  InterviewReportRecord,
  InterviewSessionRecord,
  InterviewTranscriptEventRecord,
  InterviewTranscriptEventInput,
  InterviewTurnRecord,
  InterviewTurnInput,
  InterviewVoiceConnectPayload,
  InternalInterviewVoiceContext,
  TranscriptEventRole,
  TranscriptEventType,
  VoiceTransport,
  WebsocketInterviewVoiceConnectPayload,
} from '../types.js';
import { TokenService } from './tokenService.js';
import { QuestionService } from './questionService.js';
import { ScoringService } from './scoringService.js';
import { CallbackService } from './callbackService.js';
import { InterviewReportGenerator, GroqInterviewServiceError } from './groqInterviewService.js';

type SessionWriteAuth =
  | { type: 'session'; token: string }
  | { type: 'internal' };

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly tokenService: TokenService,
    private readonly questionService: QuestionService,
    private readonly scoringService: ScoringService,
    private readonly callbackService: CallbackService,
    private readonly publicUrl: string,
    private readonly reportGenerator: InterviewReportGenerator | null = null,
  ) {}

  async createSession(payload: InterviewPayload) {
    const sessionId = randomUUID();
    const accessCode = generateAccessCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const session: InterviewSessionRecord = {
      id: sessionId,
      userId: payload.user.id,
      organizationId: payload.user.organizationId,
      opportunityId: payload.opportunity.id,
      accessCodeHash: this.tokenService.hash(accessCode),
      status: 'created',
      payload,
      callbackUrl: payload.callback.reportWebhookUrl,
      sessionTokenHash: null,
      attemptCount: 0,
      lockedUntil: null,
      expiresAt,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    await this.store.insertSession(session);
    return {
      mockSessionId: sessionId,
      interviewLink: `${this.publicUrl}/interview/${sessionId}`,
      accessCode,
      expiresAt,
    };
  }

  async verifySession(sessionId: string, accessCode: string) {
    const session = await this.requireSession(sessionId);
    const now = Date.now();

    if (new Date(session.expiresAt).getTime() <= now) {
      await this.setSessionStatus(sessionId, 'expired', 'Access code expired.');
      return { status: 410 as const, body: { message: 'This interview session has expired.' } };
    }

    if (session.lockedUntil && new Date(session.lockedUntil).getTime() > now) {
      return { status: 429 as const, body: { message: 'Too many invalid attempts. Try again later.' } };
    }

    if (this.tokenService.hash(accessCode) !== session.accessCodeHash) {
      const nextAttempts = session.attemptCount + 1;
      const lockedUntil = nextAttempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
      await this.store.updateSession(sessionId, (current) => ({
        ...current,
        attemptCount: nextAttempts,
        lockedUntil,
        errorMessage: 'Invalid access code.',
      }));
      return { status: nextAttempts >= 5 ? 429 as const : 401 as const, body: { message: nextAttempts >= 5 ? 'Too many invalid attempts. Try again later.' : 'Invalid access code.' } };
    }

    const sessionToken = this.tokenService.createToken();
    const shouldMarkOpened = session.status !== 'completed';
    await this.store.updateSession(sessionId, (current) => ({
      ...current,
      status: shouldMarkOpened ? 'opened' : current.status,
      sessionTokenHash: this.tokenService.hash(sessionToken),
      attemptCount: 0,
      lockedUntil: null,
      errorMessage: null,
      startedAt: current.startedAt ?? new Date().toISOString(),
    }));

    if (shouldMarkOpened) {
      try {
        await this.callbackService.send(session.callbackUrl, {
          mockSessionId: session.id,
          status: 'opened',
          errorMessage: null,
        });
      } catch (error) {
        await this.store.updateSession(sessionId, (current) => ({
          ...current,
          errorMessage: error instanceof Error ? error.message : 'Opened callback failed.',
        }));
      }
    }

    return {
      status: 200 as const,
      body: {
        valid: true,
        sessionToken,
        expiresIn: 3600,
      },
    };
  }

  async getSafeContext(sessionId: string, sessionToken: string) {
    const session = await this.requireAuthorizedSession(sessionId, sessionToken);
    return {
      sessionId: session.id,
      candidateName: session.payload.user.name,
      roleTitle: session.payload.opportunity.title,
      company: session.payload.opportunity.company,
      stages: session.payload.interviewConfig.stages,
      status: session.status,
    };
  }

  async createVoiceConnectPayload(sessionId: string, sessionToken: string): Promise<InterviewVoiceConnectPayload> {
    const session = await this.requireAuthorizedSession(sessionId, sessionToken);
    const transport = this.resolveVoiceTransport();
    const turns = await this.store.listTurns(session.id);
    const lastAssistantTurn = [...turns].reverse().find((turn) => turn.role === 'assistant');
    const currentStage =
      lastAssistantTurn?.stage ??
      session.payload.interviewConfig.stages[0] ??
      null;
    const currentQuestion = lastAssistantTurn?.question ?? null;
    const basePayload = {
      sessionId: session.id,
      candidateName: session.payload.user.name,
      roleTitle: session.payload.opportunity.title,
      company: session.payload.opportunity.company,
      stages: session.payload.interviewConfig.stages,
      transport,
      currentStage,
      currentQuestion,
    } as const;

    if (transport === 'websocket') {
      const signedToken = this.tokenService.createSignedVoiceToken({
        sessionId: session.id,
        transport,
      });

      const payload: WebsocketInterviewVoiceConnectPayload = {
        ...basePayload,
        transport,
        voiceToken: signedToken.token,
        pipecatConnectUrl: this.resolvePipecatConnectUrl(session.id, transport),
      };
      return payload;
    }

    const payload: DailyInterviewVoiceConnectPayload = {
      ...basePayload,
      transport,
      connectParams: null,
      setupError: null,
    };

    const dailyConfig = this.requireDailyTransportConfig();
    try {
      payload.connectParams = await this.createDailyConnectParams(session, dailyConfig);
      return payload;
    } catch {
      payload.setupError =
        'Daily transport is configured, but Daily room provisioning is unavailable. Verify the server-side Daily configuration and try again.';
      return payload;
    }
  }

  async getInternalVoiceContext(sessionId: string): Promise<InternalInterviewVoiceContext> {
    const session = await this.requireSession(sessionId);
    const answers = await this.store.listAnswers(sessionId);

    const briefRecord = await this.store.findInterviewBrief(sessionId).catch(() => null);
    const interviewMode: InterviewMode = briefRecord?.mode ?? 'resume';
    const brief: InterviewBrief = briefRecord
      ? {
          title: briefRecord.title,
          summary: briefRecord.summary,
          focusAreas: briefRecord.focusAreas,
          questionBank: briefRecord.questionBank,
          rubric: briefRecord.rubric,
        }
      : deriveBriefFromPayload(session.payload);

    const stages = resolveStagesForMode(interviewMode, session.payload.interviewConfig.stages);

    return {
      sessionId: session.id,
      status: session.status,
      transport: this.resolveVoiceTransport(),
      requestId: session.payload.requestId,
      interviewMode,
      brief,
      candidate: session.payload.user,
      opportunity: session.payload.opportunity,
      resume: session.payload.resume,
      interviewConfig: { ...session.payload.interviewConfig, stages },
      answers: answers.map((answer) => ({
        stage: answer.stage,
        question: answer.question,
        answerTranscript: answer.answerTranscript,
        audioUrl: answer.audioUrl,
        createdAt: answer.createdAt,
      })),
    };
  }

  async nextQuestion(sessionId: string, sessionToken: string, stage: string) {
    const session = await this.requireAuthorizedSession(sessionId, sessionToken);
    const answers = await this.store.listAnswers(sessionId);
    return this.questionService.nextQuestion(session, stage, answers);
  }

  async saveAnswer(
    sessionId: string,
    sessionToken: string,
    input: {
      stage: string;
      question: string;
      answerTranscript: string;
      audioUrl: string | null;
    },
  ) {
    const session = await this.requireAuthorizedSession(sessionId, sessionToken);
    await this.store.insertAnswer({
      sessionId,
      stage: input.stage,
      question: input.question,
      answerTranscript: input.answerTranscript,
      audioUrl: input.audioUrl,
      score: null,
      feedback: null,
    });

    if (session.status !== 'in_progress') {
      await this.setSessionStatus(sessionId, 'in_progress', null);
      try {
        await this.callbackService.send(session.callbackUrl, {
          mockSessionId: session.id,
          status: 'in_progress',
          errorMessage: null,
        });
      } catch (error) {
        await this.store.updateSession(sessionId, (current) => ({
          ...current,
          errorMessage: error instanceof Error ? error.message : 'In-progress callback failed.',
        }));
      }
    }

    return { ok: true };
  }

  async complete(sessionId: string, sessionToken: string): Promise<InterviewReportRecord & { status: 'completed' }> {
    const session = await this.requireAuthorizedSession(sessionId, sessionToken);
    const [answers, turns, transcriptEvents, briefRecord] = await Promise.all([
      this.store.listAnswers(sessionId),
      this.store.listTurns(sessionId),
      this.store.listTranscriptEvents(sessionId),
      this.store.findInterviewBrief(sessionId).catch(() => null),
    ]);
    const interviewMode: InterviewMode = briefRecord?.mode ?? 'resume';
    const brief: InterviewBrief = briefRecord
      ? { title: briefRecord.title, summary: briefRecord.summary, focusAreas: briefRecord.focusAreas, questionBank: briefRecord.questionBank, rubric: briefRecord.rubric }
      : deriveBriefFromPayload(session.payload);
    const scored = await this.generateInterviewReport(session, answers, turns, transcriptEvents, interviewMode, brief);
    const report = await this.store.upsertReport({
      sessionId,
      ...scored,
    });

    await this.store.updateSession(sessionId, (current) => ({
      ...current,
      status: 'completed',
      completedAt: new Date().toISOString(),
      errorMessage: null,
    }));

    try {
      await this.callbackService.send(session.callbackUrl, {
        mockSessionId: session.id,
        status: 'completed',
        overallScore: report.overallScore,
        communicationScore: report.communicationScore,
        technicalScore: report.technicalScore,
        behavioralScore: report.behavioralScore,
        jdAlignmentScore: report.jdAlignmentScore,
        summary: report.summary,
        strengths: report.strengths,
        improvements: report.improvements,
        stageScores: report.stageScores,
        transcriptUrl: null,
        errorMessage: null,
      });
    } catch (error) {
      await this.store.updateSession(sessionId, (current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : 'Callback delivery failed.',
      }));
    }

    return {
      ...report,
      status: 'completed',
    };
  }

  async getReport(sessionId: string, sessionToken: string) {
    await this.requireAuthorizedSession(sessionId, sessionToken);
    const report = await this.store.findReport(sessionId);
    if (!report) {
      throw new Error('Interview report not available yet.');
    }
    return { ...report, status: 'completed' as const };
  }

  private async generateInterviewReport(
    session: InterviewSessionRecord,
    answers: InterviewAnswerRecord[],
    turns: InterviewTurnRecord[],
    transcriptEvents: InterviewTranscriptEventRecord[],
    interviewMode: InterviewMode,
    brief: InterviewBrief,
  ): Promise<InterviewReportDraft> {
    const heuristicAnswers = selectHeuristicAnswers(answers, turns);
    if (!this.shouldUseGroqReporting() || !this.reportGenerator) {
      return this.scoringService.score(session, heuristicAnswers, interviewMode, brief);
    }

    try {
      const report = await this.reportGenerator.generateReport({
        session,
        answers: selectReportAnswers(answers, turns),
        turns,
        transcriptEvents,
        interviewMode,
        brief,
      });
      console.info('[pathwisse-mockinterview] Interview report generated.', {
        sessionId: session.id,
        reportProvider: 'groq',
        reportModel: process.env.GROQ_MODEL?.trim() || 'llama-3.1-8b-instant',
        fallbackUsed: false,
      });
      return report;
    } catch (error) {
      const reason = error instanceof GroqInterviewServiceError ? error.code : 'unknown';
      console.warn('[pathwisse-mockinterview] Falling back to heuristic scoring.', {
        sessionId: session.id,
        reportProvider: 'groq',
        reportModel: process.env.GROQ_MODEL?.trim() || 'llama-3.1-8b-instant',
        fallbackUsed: true,
        fallbackReason: reason,
      });
      return this.scoringService.score(session, heuristicAnswers, interviewMode, brief);
    }
  }

  async recordTranscriptEvent(
    sessionId: string,
    auth: SessionWriteAuth,
    input: InterviewTranscriptEventInput,
  ): Promise<{ status: 200; body: { ok: true; event: InterviewTranscriptEventRecord } }> {
    await this.requireWriteAuthorizedSession(sessionId, auth);
    const event = normalizeTranscriptEventInput(sessionId, input);
    const savedEvent = await this.store.upsertTranscriptEvent(event);
    return {
      status: 200,
      body: {
        ok: true,
        event: savedEvent,
      },
    };
  }

  async recordTurn(
    sessionId: string,
    auth: SessionWriteAuth,
    input: InterviewTurnInput,
  ): Promise<{ status: 200; body: { ok: true; turn: InterviewTurnRecord } }> {
    await this.requireWriteAuthorizedSession(sessionId, auth);
    const turn = normalizeTurnInput(sessionId, input);
    const savedTurn = await this.store.upsertTurn(turn);
    return {
      status: 200,
      body: {
        ok: true,
        turn: savedTurn,
      },
    };
  }

  private async requireSession(sessionId: string) {
    const session = await this.store.findSession(sessionId);
    if (!session) {
      throw new Error('Interview session not found.');
    }
    return session;
  }

  private async requireAuthorizedSession(sessionId: string, sessionToken: string) {
    const session = await this.requireSession(sessionId);
    if (!session.sessionTokenHash || session.sessionTokenHash !== this.tokenService.hash(sessionToken)) {
      throw new Error('Unauthorized interview session.');
    }
    return session;
  }

  private async requireWriteAuthorizedSession(sessionId: string, auth: SessionWriteAuth) {
    if (auth.type === 'internal') {
      return this.requireSession(sessionId);
    }

    return this.requireAuthorizedSession(sessionId, auth.token);
  }

  private async setSessionStatus(sessionId: string, status: InterviewSessionRecord['status'], errorMessage: string | null) {
    await this.store.updateSession(sessionId, (current) => ({
      ...current,
      status,
      errorMessage,
      completedAt: status === 'failed' || status === 'expired' ? new Date().toISOString() : current.completedAt,
    }));
  }

  private resolveVoiceTransport(): VoiceTransport {
    const configuredTransport = (process.env.VOICE_TRANSPORT ?? 'websocket').trim();
    if (configuredTransport === 'websocket' || configuredTransport === 'daily') {
      return configuredTransport;
    }
    throw new Error(`Unsupported VOICE_TRANSPORT "${configuredTransport}".`);
  }

  private resolvePipecatConnectUrl(sessionId: string, transport: VoiceTransport): string {
    const configuredUrl =
      process.env.PIPECAT_SERVICE_URL?.trim() ||
      process.env.PIPECAT_CONNECT_URL?.trim() ||
      process.env.VOICE_AGENT_BASE_URL?.trim();

    if (!configuredUrl) {
      throw new Error('PIPECAT_SERVICE_URL, PIPECAT_CONNECT_URL, or VOICE_AGENT_BASE_URL must be configured.');
    }

    const normalizedBaseUrl = configuredUrl.replace(/\/+$/, '');
    if (transport === 'websocket') {
      return `${normalizedBaseUrl.replace(/^http/i, 'ws')}/v1/realtime/${sessionId}`;
    }

    return `${normalizedBaseUrl}/v1/connect/${sessionId}`;
  }

  private requireDailyTransportConfig(): {
    apiKey: string;
    domain: string;
    serviceUrl: string;
  } {
    const roomProvider = (process.env.PIPECAT_ROOM_PROVIDER ?? 'daily').trim();
    if (roomProvider !== 'daily') {
      throw new Error('PIPECAT_ROOM_PROVIDER is not configured for Daily transport.');
    }

    const apiKey = process.env.PIPECAT_DAILY_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('PIPECAT_DAILY_API_KEY is not configured for Daily transport.');
    }

    const domain = process.env.PIPECAT_DAILY_DOMAIN?.trim().replace(/\/+$/, '');
    if (!domain) {
      throw new Error('PIPECAT_DAILY_DOMAIN is not configured for Daily transport.');
    }

    const serviceUrl = process.env.PIPECAT_SERVICE_URL?.trim().replace(/\/+$/, '');
    if (!serviceUrl) {
      throw new Error('PIPECAT_SERVICE_URL is not configured for Daily transport.');
    }

    return {
      apiKey,
      domain,
      serviceUrl,
    };
  }

  private async createDailyConnectParams(
    session: InterviewSessionRecord,
    config: {
      apiKey: string;
      domain: string;
      serviceUrl: string;
    },
  ): Promise<DailyTransportConnectParams> {
    const roomName = this.buildDailyRoomName(session.id);
    const roomUrl = this.buildDailyRoomUrl(config.domain, roomName);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const roomExpirySeconds = nowSeconds + 60 * 60;
    const tokenExpirySeconds = nowSeconds + 15 * 60;

    await this.dailyApiRequest<{ name?: string; url?: string }>(
      config.apiKey,
      '/rooms',
      {
        name: roomName,
        privacy: 'private',
        properties: {
          exp: roomExpirySeconds,
          start_audio_off: false,
          start_video_off: true,
        },
      },
      [200, 409],
    );

    const tokenResponse = await this.dailyApiRequest<{ token?: string }>(config.apiKey, '/meeting-tokens', {
      properties: {
        room_name: roomName,
        user_name: session.payload.user.name,
        user_id: session.id.slice(0, 36),
        exp: tokenExpirySeconds,
        enable_screenshare: false,
        start_audio_off: false,
        start_video_off: true,
      },
    });

    if (!tokenResponse.token?.trim()) {
      throw new Error('Daily token provisioning failed.');
    }

    return {
      url: roomUrl,
      token: tokenResponse.token,
    };
  }

  private async dailyApiRequest<TResponse>(
    apiKey: string,
    path: string,
    body: Record<string, unknown>,
    acceptedStatuses: number[] = [200],
  ): Promise<TResponse> {
    const response = await fetch(`https://api.daily.co/v1${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!acceptedStatuses.includes(response.status)) {
      throw new Error(`Daily API request failed with status ${response.status}.`);
    }

    if (response.status === 409) {
      return {} as TResponse;
    }

    return response.json() as Promise<TResponse>;
  }

  private buildDailyRoomName(sessionId: string): string {
    return `pipecat-${sessionId.replace(/[^a-z0-9-]/gi, '').toLowerCase()}`;
  }

  private buildDailyRoomUrl(domain: string, roomName: string): string {
    const normalizedDomain = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${normalizedDomain}/${roomName}`;
  }

  private shouldUseGroqReporting(): boolean {
    const provider = (process.env.LLM_PROVIDER ?? 'mock').trim().toLowerCase();
    const apiKey = process.env.GROQ_API_KEY?.trim();
    return provider === 'groq' && Boolean(apiKey);
  }
}

function generateAccessCode(): string {
  const left = Math.floor(100 + Math.random() * 900);
  const right = Math.floor(100 + Math.random() * 900);
  return `${left}-${right}`;
}

function normalizeTranscriptEventInput(
  sessionId: string,
  input: InterviewTranscriptEventInput,
): Omit<InterviewTranscriptEventRecord, 'id' | 'createdAt'> & Partial<Pick<InterviewTranscriptEventRecord, 'createdAt'>> {
  const eventId = requiredNonEmptyString(input.eventId, 'eventId');
  const type = parseTranscriptEventType(input.type);
  const text = normalizeNullableText(input.text);

  if (eventTypeRequiresText(type) && !text) {
    throw new Error(`Invalid transcript event text. Event type "${type}" requires non-empty text.`);
  }

  return {
    sessionId,
    eventId,
    turnId: normalizeOptionalString(input.turnId),
    role: resolveTranscriptEventRole(type),
    type,
    stage: normalizeOptionalString(input.stage),
    question: normalizeOptionalString(input.question),
    text,
    metadata: normalizeMetadata(input.metadata),
    createdAt: normalizeCreatedAt(input.createdAt),
  };
}

function normalizeTurnInput(
  sessionId: string,
  input: InterviewTurnInput,
): Omit<InterviewTurnRecord, 'id' | 'createdAt'> & Partial<Pick<InterviewTurnRecord, 'createdAt'>> {
  return {
    sessionId,
    turnId: requiredNonEmptyString(input.turnId, 'turnId'),
    role: parseTurnRole(input.role),
    stage: normalizeOptionalString(input.stage),
    question: normalizeOptionalString(input.question),
    text: requiredNonEmptyString(input.input, 'turn text'),
    metadata: normalizeMetadata(input.metadata),
    createdAt: normalizeCreatedAt(input.createdAt),
  };
}

function requiredNonEmptyString(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}.`);
  }
  return normalized;
}

function normalizeOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNullableText(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeCreatedAt(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid createdAt timestamp.');
  }

  return parsed.toISOString();
}

function parseTranscriptEventType(value: string): TranscriptEventType {
  switch (value) {
    case 'assistant_text':
    case 'error':
    case 'interview_complete':
    case 'user_final_transcript':
    case 'user_interim_transcript':
      return value;
    default:
      throw new Error('Invalid transcript event type.');
  }
}

function parseTurnRole(value: string | undefined): InterviewTurnRecord['role'] {
  switch (value) {
    case undefined:
    case 'user':
      return 'user';
    case 'assistant':
      return 'assistant';
    default:
      throw new Error('Invalid turn role.');
  }
}

function eventTypeRequiresText(value: TranscriptEventType): boolean {
  return value === 'assistant_text' || value === 'user_final_transcript' || value === 'user_interim_transcript';
}

function resolveTranscriptEventRole(value: TranscriptEventType): TranscriptEventRole {
  switch (value) {
    case 'assistant_text':
      return 'assistant';
    case 'error':
    case 'interview_complete':
      return 'system';
    case 'user_final_transcript':
    case 'user_interim_transcript':
      return 'user';
  }
}

function selectReportAnswers(
  answers: InterviewAnswerRecord[],
  turns: InterviewTurnRecord[],
): InterviewAnswerRecord[] {
  if (turns.length === 0) {
    return answers;
  }

  const userTurnTexts = new Set(
    turns
      .filter((turn) => turn.role === 'user')
      .map((turn) => normalizeComparableText(turn.text))
      .filter(Boolean),
  );

  return answers.filter((answer) => {
    const normalizedAnswer = normalizeComparableText(answer.answerTranscript);
    if (!normalizedAnswer) {
      return true;
    }

    return !userTurnTexts.has(normalizedAnswer);
  });
}

function selectHeuristicAnswers(
  answers: InterviewAnswerRecord[],
  turns: InterviewTurnRecord[],
): InterviewAnswerRecord[] {
  if (turns.length === 0) {
    return answers;
  }

  const reportAnswers = selectReportAnswers(answers, turns);
  const syntheticTurnAnswers = turns
    .filter((turn) => turn.role === 'user' && normalizeComparableText(turn.text))
    .map((turn) => ({
      id: `synthetic-${turn.turnId}`,
      sessionId: turn.sessionId,
      stage: turn.stage ?? 'interview',
      question: turn.question ?? 'Interview response',
      answerTranscript: turn.text,
      audioUrl: null,
      score: null,
      feedback: null,
      createdAt: turn.createdAt,
    }));

  return [...reportAnswers, ...syntheticTurnAnswers].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function deriveBriefFromPayload(payload: InterviewPayload): InterviewBrief {
  const desc = payload.opportunity.description.replace(/\s+/g, ' ').trim();
  const summary = desc.length > 300 ? `${desc.slice(0, 299).trimEnd()}...` : desc;
  const focusAreas = [
    ...payload.opportunity.matchedSkills.slice(0, 3),
    ...payload.opportunity.missingSkills.slice(0, 2),
  ].filter(Boolean);
  return {
    title: `${payload.opportunity.title} at ${payload.opportunity.company}`,
    summary: summary || 'Interview preparation based on submitted resume and job description.',
    focusAreas: focusAreas.length > 0 ? focusAreas : ['Technical skills', 'Communication'],
    questionBank: [],
    rubric: [
      { id: 'technical_skills', name: 'Technical Skills' },
      { id: 'communication', name: 'Communication' },
      { id: 'role_alignment', name: 'Role Alignment' },
      { id: 'behavioural_competencies', name: 'Behavioural Competencies' },
    ],
  };
}

function resolveStagesForMode(mode: InterviewMode, existingStages: string[]): string[] {
  switch (mode) {
    case 'capstone':
      return ['project_overview', 'technical_deepdive', 'design_decisions', 'reflection'];
    case 'skill':
      return ['fundamentals', 'applied', 'edge_cases', 'depth'];
    default:
      return existingStages;
  }
}
