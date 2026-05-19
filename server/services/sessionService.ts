import { randomUUID } from 'crypto';
import { SessionStore } from '../db/store.js';
import {
  InterviewPayload,
  InterviewReportRecord,
  InterviewSessionRecord,
  InterviewTranscriptEventInput,
  InterviewTurnInput,
  InterviewVoiceConnectPayload,
  InternalInterviewVoiceContext,
  PlaceholderRouteResult,
  VoiceTransport,
} from '../types.js';
import { TokenService } from './tokenService.js';
import { QuestionService } from './questionService.js';
import { ScoringService } from './scoringService.js';
import { CallbackService } from './callbackService.js';

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly tokenService: TokenService,
    private readonly questionService: QuestionService,
    private readonly scoringService: ScoringService,
    private readonly callbackService: CallbackService,
    private readonly publicUrl: string,
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
    const signedToken = this.tokenService.createSignedVoiceToken({
      sessionId: session.id,
      transport,
    });

    return {
      sessionId: session.id,
      candidateName: session.payload.user.name,
      roleTitle: session.payload.opportunity.title,
      company: session.payload.opportunity.company,
      stages: session.payload.interviewConfig.stages,
      voiceToken: signedToken.token,
      pipecatConnectUrl: this.resolvePipecatConnectUrl(session.id, transport),
      transport,
    };
  }

  async getInternalVoiceContext(sessionId: string): Promise<InternalInterviewVoiceContext> {
    const session = await this.requireSession(sessionId);
    const answers = await this.store.listAnswers(sessionId);

    return {
      sessionId: session.id,
      status: session.status,
      transport: this.resolveVoiceTransport(),
      requestId: session.payload.requestId,
      candidate: session.payload.user,
      opportunity: session.payload.opportunity,
      resume: session.payload.resume,
      interviewConfig: session.payload.interviewConfig,
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
    const answers = await this.store.listAnswers(sessionId);
    const scored = this.scoringService.score(session, answers);
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

  async recordTranscriptEvent(
    sessionId: string,
    sessionToken: string,
    _input: InterviewTranscriptEventInput,
  ): Promise<PlaceholderRouteResult> {
    await this.requireAuthorizedSession(sessionId, sessionToken);
    return {
      status: 501,
      body: {
        code: 'TRANSCRIPT_EVENTS_NOT_READY',
        message: 'Transcript event ingestion is not ready yet.',
      },
    };
  }

  async recordTurn(
    sessionId: string,
    sessionToken: string,
    _input: InterviewTurnInput,
  ): Promise<PlaceholderRouteResult> {
    await this.requireAuthorizedSession(sessionId, sessionToken);
    return {
      status: 501,
      body: {
        code: 'TURNS_NOT_READY',
        message: 'Turn persistence is not ready yet.',
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

  private async setSessionStatus(sessionId: string, status: InterviewSessionRecord['status'], errorMessage: string | null) {
    await this.store.updateSession(sessionId, (current) => ({
      ...current,
      status,
      errorMessage,
      completedAt: status === 'failed' || status === 'expired' ? new Date().toISOString() : current.completedAt,
    }));
  }

  private resolveVoiceTransport(): VoiceTransport {
    const configuredTransport = (process.env.VOICE_TRANSPORT ?? 'daily').trim();
    if (configuredTransport === 'websocket' || configuredTransport === 'daily') {
      return configuredTransport;
    }
    throw new Error(`Unsupported VOICE_TRANSPORT "${configuredTransport}".`);
  }

  private resolvePipecatConnectUrl(sessionId: string, transport: VoiceTransport): string {
    const configuredUrl =
      process.env.PIPECAT_CONNECT_URL?.trim() ||
      process.env.VOICE_AGENT_BASE_URL?.trim();

    if (!configuredUrl) {
      throw new Error('PIPECAT_CONNECT_URL or VOICE_AGENT_BASE_URL must be configured.');
    }

    const normalizedBaseUrl = configuredUrl.replace(/\/+$/, '');
    if (transport === 'websocket') {
      return `${normalizedBaseUrl.replace(/^http/i, 'ws')}/v1/realtime/${sessionId}`;
    }

    return `${normalizedBaseUrl}/v1/connect/${sessionId}`;
  }
}

function generateAccessCode(): string {
  const left = Math.floor(100 + Math.random() * 900);
  const right = Math.floor(100 + Math.random() * 900);
  return `${left}-${right}`;
}
