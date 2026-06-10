import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionStore } from '../server/db/store.ts';
import {
  type InterviewAnswerRecord,
  type InterviewPayload,
  type InterviewReportDraft,
  type InterviewReportRecord,
  type InterviewSessionRecord,
  type InterviewTranscriptEventRecord,
  type InterviewTurnRecord,
} from '../server/types.ts';
import {
  GroqInterviewService,
  GroqInterviewServiceError,
  type InterviewReportGenerationInput,
  type InterviewReportGenerator,
} from '../server/services/groqInterviewService.ts';
import { SessionService } from '../server/services/sessionService.ts';
import { ScoringService } from '../server/services/scoringService.ts';
import { TokenService } from '../server/services/tokenService.ts';

test('GroqInterviewService normalizes JSON output into a report draft', async () => {
  const service = new GroqInterviewService({
    provider: 'groq',
    apiKey: 'test-key',
    model: 'llama-3.1-8b-instant',
    temperature: 0.3,
    maxTokens: 1200,
    timeoutMs: 15_000,
    retryCount: 0,
    fetch: async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              overallScore: '84',
              communicationScore: '81',
              technicalScore: '87',
              behavioralScore: 79,
              jdAlignmentScore: '86',
              summary: ' Strong fit with clear, evidence-backed answers. ',
              strengths: [' Structured communication ', 'Python fundamentals', '', 5],
              improvements: ['Add more metrics', 'Deepen system design examples', null],
              stageScores: {
                introduction: '80',
                jd_technical: 88,
              },
            }),
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  const report = await service.generateReport(createGenerationInput());

  assert.deepEqual(report, {
    overallScore: 84,
    communicationScore: 81,
    technicalScore: 87,
    behavioralScore: 79,
    jdAlignmentScore: 86,
    summary: 'Strong fit with clear, evidence-backed answers.',
    strengths: ['Structured communication', 'Python fundamentals'],
    improvements: ['Add more metrics', 'Deepen system design examples'],
    stageScores: {
      introduction: 80,
      jd_technical: 88,
    },
    questionEvaluations: [],
  });
});

test('GroqInterviewService retries a provider failure once before succeeding', async () => {
  let attempts = 0;
  const service = new GroqInterviewService({
    provider: 'groq',
    apiKey: 'test-key',
    retryCount: 1,
    fetch: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response('upstream unavailable', { status: 503 });
      }

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(createReportDraft()),
            },
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const report = await service.generateReport(createGenerationInput());

  assert.equal(attempts, 2);
  assert.equal(report.overallScore, 88);
});

test('SessionService.complete passes richer Pipecat context to Mistral and avoids duplicate legacy answers', async () => {
  const tokenService = new TokenService();
  const sessionToken = 'session-token';
  const store = createStore({
    session: createSession(tokenService, sessionToken),
    answers: [
      createAnswer({
        stage: 'jd_technical',
        question: 'Tell me about your Python work.',
        answerTranscript: 'I built Python APIs for async ingestion and observability.',
      }),
    ],
    turns: [
      createTurn({
        turnId: 'turn-1',
        role: 'assistant',
        stage: 'jd_technical',
        question: 'Tell me about your Python work.',
        text: 'Tell me about your Python work.',
      }),
      createTurn({
        turnId: 'turn-2',
        role: 'user',
        stage: 'jd_technical',
        question: 'Tell me about your Python work.',
        text: 'I built Python APIs for async ingestion and observability.',
      }),
    ],
    transcriptEvents: [
      createTranscriptEvent({
        eventId: 'evt-1',
        turnId: 'turn-2',
        type: 'user_final_transcript',
        role: 'user',
        stage: 'jd_technical',
        question: 'Tell me about your Python work.',
        text: 'I built Python APIs for async ingestion and observability.',
      }),
    ],
  });

  let capturedInput: InterviewReportGenerationInput | null = null;
  const mistralService: InterviewReportGenerator = {
    generateReport: async (input) => {
      capturedInput = input;
      return createReportDraft();
    },
  };

  const callbackPayloads: Array<Record<string, unknown>> = [];
  const service = new SessionService(
    store,
    tokenService,
    {} as never,
    new ScoringService(),
    {
      send: async (_url: string, payload: Record<string, unknown>) => {
        callbackPayloads.push(payload);
      },
    } as never,
    'http://localhost:5174',
    mistralService,
  );

  await withEnv({
    LLM_PROVIDER: 'groq',
    GROQ_API_KEY: 'test-key',
  }, async () => {
    const report = await service.complete(store.session.id, sessionToken);
    assert.equal(report.overallScore, 88);
  });

  assert.ok(capturedInput);
  assert.equal(capturedInput.turns.length, 2);
  assert.equal(capturedInput.transcriptEvents.length, 1);
  assert.equal(capturedInput.answers.length, 0);
  assert.equal(callbackPayloads.at(-1)?.status, 'completed');
  assert.equal(callbackPayloads.at(-1)?.overallScore, 88);
});

test('SessionService.complete falls back to ScoringService when Mistral generation fails', async () => {
  const tokenService = new TokenService();
  const sessionToken = 'session-token';
  const store = createStore({
    session: createSession(tokenService, sessionToken),
    answers: [
      createAnswer({
        stage: 'behavioral',
        question: 'Tell me about a time you learned quickly.',
        answerTranscript: 'I learned a new service quickly and improved the team result with clear ownership.',
      }),
    ],
  });

  const service = new SessionService(
    store,
    tokenService,
    {} as never,
    new ScoringService(),
    { send: async () => undefined } as never,
    'http://localhost:5174',
    {
      generateReport: async () => {
        throw new GroqInterviewServiceError('validation', 'Invalid report payload.');
      },
    },
  );

  await withEnv({
    LLM_PROVIDER: 'groq',
    GROQ_API_KEY: 'test-key',
  }, async () => {
    const report = await service.complete(store.session.id, sessionToken);
    assert.match(report.summary, /The candidate showed promising alignment/);
    assert.ok(report.stageScores.behavioral);
  });
});

test('SessionService.complete uses Pipecat user turns for heuristic fallback when legacy answers are absent', async () => {
  const tokenService = new TokenService();
  const sessionToken = 'session-token';
  const store = createStore({
    session: createSession(tokenService, sessionToken),
    turns: [
      createTurn({
        turnId: 'turn-a',
        role: 'assistant',
        stage: 'behavioral',
        question: 'Tell me about a time you learned quickly.',
        text: 'Tell me about a time you learned quickly.',
      }),
      createTurn({
        turnId: 'turn-b',
        role: 'user',
        stage: 'behavioral',
        question: 'Tell me about a time you learned quickly.',
        text: 'I learned a new service quickly, aligned the team, and improved the result.',
      }),
    ],
  });

  const service = new SessionService(
    store,
    tokenService,
    {} as never,
    new ScoringService(),
    { send: async () => undefined } as never,
    'http://localhost:5174',
    {
      generateReport: async () => {
        throw new GroqInterviewServiceError('timeout', 'Timed out.');
      },
    },
  );

  await withEnv({
    LLM_PROVIDER: 'groq',
    GROQ_API_KEY: 'test-key',
  }, async () => {
    const report = await service.complete(store.session.id, sessionToken);
    assert.ok(report.communicationScore && report.communicationScore > 55);
    assert.ok(report.behavioralScore && report.behavioralScore > 60);
    assert.equal(report.stageScores.behavioral, report.behavioralScore);
  });
});

function createGenerationInput(): InterviewReportGenerationInput {
  const session = createSession(new TokenService(), 'unused-token');
  return {
    session,
    answers: [
      createAnswer({
        stage: 'behavioral',
        question: 'Tell me about a team challenge.',
        answerTranscript: 'I aligned the team, clarified ownership, and improved delivery.',
      }),
    ],
    turns: [],
    transcriptEvents: [],
  };
}

function createReportDraft(): InterviewReportDraft {
  return {
    overallScore: 88,
    communicationScore: 84,
    technicalScore: 90,
    behavioralScore: 82,
    jdAlignmentScore: 86,
    summary: 'Clear, grounded answers with good role alignment.',
    strengths: ['Structured examples', 'Strong Python depth'],
    improvements: ['Add more measurable outcomes', 'Go deeper on trade-offs'],
    stageScores: {
      jd_technical: 89,
      behavioral: 82,
    },
  };
}

function createStore(input: {
  session: InterviewSessionRecord;
  answers?: InterviewAnswerRecord[];
  turns?: InterviewTurnRecord[];
  transcriptEvents?: InterviewTranscriptEventRecord[];
}): SessionStore & { session: InterviewSessionRecord } {
  const answers = [...(input.answers ?? [])];
  const turns = [...(input.turns ?? [])];
  const transcriptEvents = [...(input.transcriptEvents ?? [])];
  let report: InterviewReportRecord | null = null;
  let session = input.session;

  return {
    session,
    insertSession: async () => undefined,
    updateSession: async (_id, updater) => {
      session = updater(session);
      return session;
    },
    findSession: async (id) => id === session.id ? session : null,
    insertAnswer: async () => undefined,
    listAnswers: async () => answers,
    upsertReport: async (next) => {
      report = {
        id: 'report-1',
        createdAt: '2026-05-19T00:00:00.000Z',
        ...next,
      };
      return report;
    },
    findReport: async () => report,
    upsertTranscriptEvent: async (event) => ({
      id: 'event-row-1',
      createdAt: event.createdAt ?? '2026-05-19T00:00:00.000Z',
      ...event,
    }),
    upsertTurn: async (turn) => ({
      id: 'turn-row-1',
      createdAt: turn.createdAt ?? '2026-05-19T00:00:00.000Z',
      ...turn,
    }),
    listTranscriptEvents: async () => transcriptEvents,
    listTurns: async () => turns,
    insertInterviewBrief: async () => undefined,
    findInterviewBrief: async () => null,
  };
}

function createSession(tokenService: TokenService, sessionToken: string): InterviewSessionRecord {
  const payload: InterviewPayload = {
    source: 'pathwisse-lms',
    requestId: 'req-1',
    user: {
      id: 'user-1',
      name: 'Jane Candidate',
      email: 'jane@example.com',
      organizationId: 'org-1',
    },
    opportunity: {
      id: 'opp-1',
      matchId: 'match-1',
      title: 'Backend Engineer',
      company: 'Pathwisse',
      location: 'Remote',
      description: 'Build backend systems with Node.js and Python.',
      matchedSkills: ['Node.js', 'Python', 'PostgreSQL'],
      missingSkills: ['System design'],
      recommendedActions: ['Quantify impact', 'Explain trade-offs clearly'],
    },
    resume: {
      resumeId: 'resume-1',
      text: 'Backend engineer with Python, Node.js, and PostgreSQL experience across async APIs.',
      fileName: 'resume.pdf',
    },
    interviewConfig: {
      mode: 'voice',
      difficulty: 'entry_level',
      durationMinutes: 30,
      stages: ['introduction', 'jd_technical', 'behavioral'],
    },
    callback: {
      reportWebhookUrl: 'https://example.com/callback',
    },
  };

  return {
    id: 'session-1',
    userId: payload.user.id,
    organizationId: payload.user.organizationId,
    opportunityId: payload.opportunity.id,
    accessCodeHash: 'access-code-hash',
    status: 'opened',
    payload,
    callbackUrl: payload.callback.reportWebhookUrl,
    sessionTokenHash: tokenService.hash(sessionToken),
    attemptCount: 0,
    lockedUntil: null,
    expiresAt: '2026-05-19T01:00:00.000Z',
    errorMessage: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    startedAt: '2026-05-19T00:05:00.000Z',
    completedAt: null,
  };
}

function createAnswer(input: {
  stage: string;
  question: string;
  answerTranscript: string;
}): InterviewAnswerRecord {
  return {
    id: `answer-${input.stage}`,
    sessionId: 'session-1',
    stage: input.stage,
    question: input.question,
    answerTranscript: input.answerTranscript,
    audioUrl: null,
    score: null,
    feedback: null,
    createdAt: '2026-05-19T00:10:00.000Z',
  };
}

function createTurn(input: {
  turnId: string;
  role: InterviewTurnRecord['role'];
  stage: string | null;
  question: string | null;
  text: string;
}): InterviewTurnRecord {
  return {
    id: input.turnId,
    sessionId: 'session-1',
    turnId: input.turnId,
    role: input.role,
    stage: input.stage,
    question: input.question,
    text: input.text,
    metadata: {},
    createdAt: input.turnId === 'turn-1' ? '2026-05-19T00:09:00.000Z' : '2026-05-19T00:10:00.000Z',
  };
}

function createTranscriptEvent(input: {
  eventId: string;
  turnId: string | null;
  type: InterviewTranscriptEventRecord['type'];
  role: InterviewTranscriptEventRecord['role'];
  stage: string | null;
  question: string | null;
  text: string | null;
}): InterviewTranscriptEventRecord {
  return {
    id: input.eventId,
    sessionId: 'session-1',
    eventId: input.eventId,
    turnId: input.turnId,
    role: input.role,
    type: input.type,
    stage: input.stage,
    question: input.question,
    text: input.text,
    metadata: {},
    createdAt: '2026-05-19T00:10:01.000Z',
  };
}

async function withEnv(env: Record<string, string | undefined>, action: () => Promise<void>): Promise<void> {
  const previousEntries = Object.entries(env).map(([key, value]) => [key, process.env[key], value] as const);

  for (const [key, , value] of previousEntries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    await action();
  } finally {
    for (const [key, previousValue] of previousEntries) {
      if (previousValue === undefined) delete process.env[key];
      else process.env[key] = previousValue;
    }
  }
}
