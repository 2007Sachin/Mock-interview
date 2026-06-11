import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import {
  InterviewAnswerRecord,
  InterviewBriefRecord,
  InterviewReportRecord,
  InterviewSessionRecord,
  InterviewTranscriptEventRecord,
  InterviewTurnRecord,
  QuestionEvaluation,
} from '../types.js';

type DatabaseShape = {
  sessions: InterviewSessionRecord[];
  answers: InterviewAnswerRecord[];
  reports: InterviewReportRecord[];
  transcriptEvents: InterviewTranscriptEventRecord[];
  turns: InterviewTurnRecord[];
  interviewBriefs: InterviewBriefRecord[];
};

const defaultDb: DatabaseShape = {
  sessions: [],
  answers: [],
  reports: [],
  transcriptEvents: [],
  turns: [],
  interviewBriefs: [],
};

export interface SessionStore {
  insertSession(session: InterviewSessionRecord): Promise<void>;
  updateSession(
    id: string,
    updater: (session: InterviewSessionRecord) => InterviewSessionRecord,
  ): Promise<InterviewSessionRecord | null>;
  findSession(id: string): Promise<InterviewSessionRecord | null>;
  insertAnswer(answer: Omit<InterviewAnswerRecord, 'id' | 'createdAt'>): Promise<void>;
  listAnswers(sessionId: string): Promise<InterviewAnswerRecord[]>;
  upsertReport(report: Omit<InterviewReportRecord, 'id' | 'createdAt'>): Promise<InterviewReportRecord>;
  findReport(sessionId: string): Promise<InterviewReportRecord | null>;
  upsertTranscriptEvent(
    event: Omit<InterviewTranscriptEventRecord, 'id' | 'createdAt'> & Partial<Pick<InterviewTranscriptEventRecord, 'id' | 'createdAt'>>,
  ): Promise<InterviewTranscriptEventRecord>;
  upsertTurn(
    turn: Omit<InterviewTurnRecord, 'id' | 'createdAt'> & Partial<Pick<InterviewTurnRecord, 'id' | 'createdAt'>>,
  ): Promise<InterviewTurnRecord>;
  listTranscriptEvents(sessionId: string): Promise<InterviewTranscriptEventRecord[]>;
  listTurns(sessionId: string): Promise<InterviewTurnRecord[]>;
  insertInterviewBrief(brief: InterviewBriefRecord): Promise<void>;
  findInterviewBrief(id: string): Promise<InterviewBriefRecord | null>;
}

export function createSessionStore(args: {
  storageBackend?: string;
  databaseUrl?: string;
  supabaseDatabaseUrl?: string;
  filePath: string;
}): SessionStore {
  const backend = (args.storageBackend ?? '').toLowerCase().trim();

  if (backend === 'supabase') {
    const url = args.supabaseDatabaseUrl ?? args.databaseUrl;
    if (!url) {
      throw new Error(
        'SUPABASE_DATABASE_URL (or DATABASE_URL) is required when STORAGE_BACKEND=supabase. ' +
        'Set it to your Supabase Transaction Pooler URL from the Supabase dashboard.',
      );
    }
    console.info('[pathwisse-mockinterview] Using Supabase (postgres) storage backend.');
    return new PostgresStore(url);
  }

  if (args.databaseUrl) {
    console.info('[pathwisse-mockinterview] Using Postgres storage backend.');
    return new PostgresStore(args.databaseUrl);
  }

  console.warn(
    '[pathwisse-mockinterview] STORAGE_BACKEND and DATABASE_URL are not set. ' +
    'Using file-backed store — local development only.',
  );
  return new FileStore(args.filePath);
}

// ---------------------------------------------------------------------------
// File-backed store (local dev only)
// ---------------------------------------------------------------------------

class FileStore implements SessionStore {
  // Every write is a read-modify-write of one JSON file. Serialize them so
  // concurrent inserts (e.g. brief + session created in Promise.all) cannot
  // clobber each other's changes.
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  private async load(): Promise<DatabaseShape> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return { ...defaultDb, ...JSON.parse(raw) } as DatabaseShape;
    } catch {
      return structuredClone(defaultDb);
    }
  }

  private async save(db: DatabaseShape): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(db, null, 2), 'utf8');
  }

  async insertSession(session: InterviewSessionRecord): Promise<void> {
    await this.enqueueWrite(async () => {
      const db = await this.load();
      db.sessions.push(session);
      await this.save(db);
    });
  }

  async updateSession(
    id: string,
    updater: (session: InterviewSessionRecord) => InterviewSessionRecord,
  ): Promise<InterviewSessionRecord | null> {
    return this.enqueueWrite(async () => {
      const db = await this.load();
      const index = db.sessions.findIndex((item) => item.id === id);
      if (index === -1) return null;
      db.sessions[index] = updater(db.sessions[index]);
      await this.save(db);
      return db.sessions[index];
    });
  }

  async findSession(id: string): Promise<InterviewSessionRecord | null> {
    const db = await this.load();
    return db.sessions.find((item) => item.id === id) ?? null;
  }

  async insertAnswer(answer: Omit<InterviewAnswerRecord, 'id' | 'createdAt'>): Promise<void> {
    await this.enqueueWrite(async () => {
      const db = await this.load();
      db.answers.push({ ...answer, id: randomUUID(), createdAt: new Date().toISOString() });
      await this.save(db);
    });
  }

  async listAnswers(sessionId: string): Promise<InterviewAnswerRecord[]> {
    const db = await this.load();
    return db.answers.filter((item) => item.sessionId === sessionId);
  }

  async upsertReport(report: Omit<InterviewReportRecord, 'id' | 'createdAt'>): Promise<InterviewReportRecord> {
    return this.enqueueWrite(async () => {
      const db = await this.load();
      const existingIndex = db.reports.findIndex((item) => item.sessionId === report.sessionId);
      const nextReport: InterviewReportRecord = {
        id: existingIndex >= 0 ? db.reports[existingIndex].id : randomUUID(),
        createdAt: existingIndex >= 0 ? db.reports[existingIndex].createdAt : new Date().toISOString(),
        ...report,
      };
      if (existingIndex >= 0) {
        db.reports[existingIndex] = nextReport;
      } else {
        db.reports.push(nextReport);
      }
      await this.save(db);
      return nextReport;
    });
  }

  async findReport(sessionId: string): Promise<InterviewReportRecord | null> {
    const db = await this.load();
    return db.reports.find((item) => item.sessionId === sessionId) ?? null;
  }

  async upsertTranscriptEvent(
    event: Omit<InterviewTranscriptEventRecord, 'id' | 'createdAt'> & Partial<Pick<InterviewTranscriptEventRecord, 'id' | 'createdAt'>>,
  ): Promise<InterviewTranscriptEventRecord> {
    return this.enqueueWrite(async () => {
      const db = await this.load();
      const existing = db.transcriptEvents.find((item) => item.eventId === event.eventId);
      const nextEvent: InterviewTranscriptEventRecord = {
        id: existing?.id ?? event.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? event.createdAt ?? new Date().toISOString(),
        ...event,
      };
      db.transcriptEvents = db.transcriptEvents.filter((item) => item.eventId !== event.eventId);
      db.transcriptEvents.push(nextEvent);
      await this.save(db);
      return nextEvent;
    });
  }

  async upsertTurn(
    turn: Omit<InterviewTurnRecord, 'id' | 'createdAt'> & Partial<Pick<InterviewTurnRecord, 'id' | 'createdAt'>>,
  ): Promise<InterviewTurnRecord> {
    return this.enqueueWrite(async () => {
      const db = await this.load();
      const existing = db.turns.find((item) => item.turnId === turn.turnId);
      const nextTurn: InterviewTurnRecord = {
        id: existing?.id ?? turn.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? turn.createdAt ?? new Date().toISOString(),
        ...turn,
      };
      db.turns = db.turns.filter((item) => item.turnId !== turn.turnId);
      db.turns.push(nextTurn);
      await this.save(db);
      return nextTurn;
    });
  }

  async listTranscriptEvents(sessionId: string): Promise<InterviewTranscriptEventRecord[]> {
    const db = await this.load();
    return db.transcriptEvents.filter((item) => item.sessionId === sessionId).sort(compareCreatedAtAsc);
  }

  async listTurns(sessionId: string): Promise<InterviewTurnRecord[]> {
    const db = await this.load();
    return db.turns.filter((item) => item.sessionId === sessionId).sort(compareCreatedAtAsc);
  }

  async insertInterviewBrief(brief: InterviewBriefRecord): Promise<void> {
    await this.enqueueWrite(async () => {
      const db = await this.load();
      db.interviewBriefs.push(brief);
      await this.save(db);
    });
  }

  async findInterviewBrief(id: string): Promise<InterviewBriefRecord | null> {
    const db = await this.load();
    return db.interviewBriefs.find((item) => item.id === id) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Postgres store (production / Supabase)
// ---------------------------------------------------------------------------

class PostgresStore implements SessionStore {
  private readonly client: Client;
  private connectPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.client = new Client({
      connectionString: normalizeConnectionString(databaseUrl),
      ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
    });
  }

  async insertSession(session: InterviewSessionRecord): Promise<void> {
    await this.connect();
    await this.client.query(
      `insert into interview_sessions (
        id, user_id, organization_id, opportunity_id, access_code_hash, status, payload, callback_url,
        session_token_hash, attempt_count, locked_until, expires_at, error_message, created_at, started_at, completed_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )`,
      [
        session.id, session.userId, session.organizationId, session.opportunityId,
        session.accessCodeHash, session.status, JSON.stringify(session.payload), session.callbackUrl,
        session.sessionTokenHash, session.attemptCount, session.lockedUntil, session.expiresAt,
        session.errorMessage, session.createdAt, session.startedAt, session.completedAt,
      ],
    );
  }

  async updateSession(
    id: string,
    updater: (session: InterviewSessionRecord) => InterviewSessionRecord,
  ): Promise<InterviewSessionRecord | null> {
    const current = await this.findSession(id);
    if (!current) return null;
    const next = updater(current);
    await this.connect();
    await this.client.query(
      `update interview_sessions
       set user_id = $2, organization_id = $3, opportunity_id = $4, access_code_hash = $5,
           status = $6, payload = $7::jsonb, callback_url = $8, session_token_hash = $9,
           attempt_count = $10, locked_until = $11, expires_at = $12, error_message = $13,
           created_at = $14, started_at = $15, completed_at = $16
       where id = $1`,
      [
        next.id, next.userId, next.organizationId, next.opportunityId,
        next.accessCodeHash, next.status, JSON.stringify(next.payload), next.callbackUrl,
        next.sessionTokenHash, next.attemptCount, next.lockedUntil, next.expiresAt,
        next.errorMessage, next.createdAt, next.startedAt, next.completedAt,
      ],
    );
    return next;
  }

  async findSession(id: string): Promise<InterviewSessionRecord | null> {
    await this.connect();
    const result = await this.client.query(
      `select id, user_id, organization_id, opportunity_id, access_code_hash, status, payload, callback_url,
              session_token_hash, attempt_count, locked_until, expires_at, error_message, created_at, started_at, completed_at
       from interview_sessions where id = $1 limit 1`,
      [id],
    );
    return result.rows[0] ? mapSessionRow(result.rows[0]) : null;
  }

  async insertAnswer(answer: Omit<InterviewAnswerRecord, 'id' | 'createdAt'>): Promise<void> {
    await this.connect();
    await this.client.query(
      `insert into interview_answers (id, session_id, stage, question, answer_transcript, audio_url, score, feedback, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(), answer.sessionId, answer.stage, answer.question,
        answer.answerTranscript, answer.audioUrl, answer.score, answer.feedback, new Date().toISOString(),
      ],
    );
  }

  async listAnswers(sessionId: string): Promise<InterviewAnswerRecord[]> {
    await this.connect();
    const result = await this.client.query(
      `select id, session_id, stage, question, answer_transcript, audio_url, score, feedback, created_at
       from interview_answers where session_id = $1 order by created_at asc`,
      [sessionId],
    );
    return result.rows.map(mapAnswerRow);
  }

  async upsertReport(report: Omit<InterviewReportRecord, 'id' | 'createdAt'>): Promise<InterviewReportRecord> {
    await this.connect();
    const existing = await this.findReport(report.sessionId);
    const next: InterviewReportRecord = {
      id: existing?.id ?? randomUUID(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...report,
    };
    await this.client.query(
      `insert into interview_reports (
        id, session_id, overall_score, communication_score, technical_score, behavioral_score,
        jd_alignment_score, summary, strengths, improvements, stage_scores, question_evaluations, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13)
      on conflict (session_id) do update set
        overall_score = excluded.overall_score, communication_score = excluded.communication_score,
        technical_score = excluded.technical_score, behavioral_score = excluded.behavioral_score,
        jd_alignment_score = excluded.jd_alignment_score, summary = excluded.summary,
        strengths = excluded.strengths, improvements = excluded.improvements,
        stage_scores = excluded.stage_scores, question_evaluations = excluded.question_evaluations`,
      [
        next.id, next.sessionId, next.overallScore, next.communicationScore, next.technicalScore,
        next.behavioralScore, next.jdAlignmentScore, next.summary,
        JSON.stringify(next.strengths), JSON.stringify(next.improvements),
        JSON.stringify(next.stageScores), JSON.stringify(next.questionEvaluations ?? []),
        next.createdAt,
      ],
    );
    return next;
  }

  async findReport(sessionId: string): Promise<InterviewReportRecord | null> {
    await this.connect();
    const result = await this.client.query(
      `select id, session_id, overall_score, communication_score, technical_score, behavioral_score,
              jd_alignment_score, summary, strengths, improvements, stage_scores, question_evaluations, created_at
       from interview_reports where session_id = $1 limit 1`,
      [sessionId],
    );
    return result.rows[0] ? mapReportRow(result.rows[0]) : null;
  }

  async upsertTranscriptEvent(
    event: Omit<InterviewTranscriptEventRecord, 'id' | 'createdAt'> & Partial<Pick<InterviewTranscriptEventRecord, 'id' | 'createdAt'>>,
  ): Promise<InterviewTranscriptEventRecord> {
    await this.connect();
    const result = await this.client.query(
      `insert into interview_transcript_events (id, session_id, event_id, turn_id, role, type, stage, question, text, metadata, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       on conflict (event_id) do update set
         session_id = excluded.session_id, turn_id = excluded.turn_id, role = excluded.role,
         type = excluded.type, stage = excluded.stage, question = excluded.question,
         text = excluded.text, metadata = excluded.metadata
       returning id, session_id, event_id, turn_id, role, type, stage, question, text, metadata, created_at`,
      [
        event.id ?? randomUUID(), event.sessionId, event.eventId, event.turnId,
        event.role, event.type, event.stage, event.question, event.text,
        JSON.stringify(event.metadata), event.createdAt ?? new Date().toISOString(),
      ],
    );
    return mapTranscriptEventRow(result.rows[0]);
  }

  async upsertTurn(
    turn: Omit<InterviewTurnRecord, 'id' | 'createdAt'> & Partial<Pick<InterviewTurnRecord, 'id' | 'createdAt'>>,
  ): Promise<InterviewTurnRecord> {
    await this.connect();
    const result = await this.client.query(
      `insert into interview_turns (id, session_id, turn_id, role, stage, question, text, metadata, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       on conflict (turn_id) do update set
         session_id = excluded.session_id, role = excluded.role, stage = excluded.stage,
         question = excluded.question, text = excluded.text, metadata = excluded.metadata
       returning id, session_id, turn_id, role, stage, question, text, metadata, created_at`,
      [
        turn.id ?? randomUUID(), turn.sessionId, turn.turnId, turn.role,
        turn.stage, turn.question, turn.text, JSON.stringify(turn.metadata),
        turn.createdAt ?? new Date().toISOString(),
      ],
    );
    return mapTurnRow(result.rows[0]);
  }

  async listTranscriptEvents(sessionId: string): Promise<InterviewTranscriptEventRecord[]> {
    await this.connect();
    const result = await this.client.query(
      `select id, session_id, event_id, turn_id, role, type, stage, question, text, metadata, created_at
       from interview_transcript_events where session_id = $1 order by created_at asc`,
      [sessionId],
    );
    return result.rows.map(mapTranscriptEventRow);
  }

  async listTurns(sessionId: string): Promise<InterviewTurnRecord[]> {
    await this.connect();
    const result = await this.client.query(
      `select id, session_id, turn_id, role, stage, question, text, metadata, created_at
       from interview_turns where session_id = $1 order by created_at asc`,
      [sessionId],
    );
    return result.rows.map(mapTurnRow);
  }

  async insertInterviewBrief(brief: InterviewBriefRecord): Promise<void> {
    await this.connect();
    await this.client.query(
      `insert into interview_briefs (id, mode, access_code_hash, title, summary, focus_areas, question_bank, rubric, created_at, expires_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        brief.id, brief.mode, brief.accessCodeHash, brief.title, brief.summary,
        JSON.stringify(brief.focusAreas), JSON.stringify(brief.questionBank),
        JSON.stringify(brief.rubric), brief.createdAt, brief.expiresAt,
      ],
    );
  }

  async findInterviewBrief(id: string): Promise<InterviewBriefRecord | null> {
    await this.connect();
    const result = await this.client.query(
      `select id, mode, access_code_hash, title, summary, focus_areas, question_bank, rubric, created_at, expires_at
       from interview_briefs where id = $1 limit 1`,
      [id],
    );
    return result.rows[0] ? mapBriefRow(result.rows[0]) : null;
  }

  private async connect(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().then(() => undefined);
    }
    await this.connectPromise;
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapSessionRow(row: Record<string, unknown>): InterviewSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    organizationId: nullableString(row.organization_id),
    opportunityId: String(row.opportunity_id),
    accessCodeHash: String(row.access_code_hash),
    status: String(row.status) as InterviewSessionRecord['status'],
    payload: row.payload as InterviewSessionRecord['payload'],
    callbackUrl: String(row.callback_url),
    sessionTokenHash: nullableString(row.session_token_hash),
    attemptCount: Number(row.attempt_count),
    lockedUntil: nullableDateString(row.locked_until),
    expiresAt: dateString(row.expires_at),
    errorMessage: nullableString(row.error_message),
    createdAt: dateString(row.created_at),
    startedAt: nullableDateString(row.started_at),
    completedAt: nullableDateString(row.completed_at),
  };
}

function mapAnswerRow(row: Record<string, unknown>): InterviewAnswerRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    stage: String(row.stage),
    question: String(row.question),
    answerTranscript: String(row.answer_transcript),
    audioUrl: nullableString(row.audio_url),
    score: nullableNumber(row.score),
    feedback: nullableString(row.feedback),
    createdAt: dateString(row.created_at),
  };
}

function mapReportRow(row: Record<string, unknown>): InterviewReportRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    overallScore: Number(row.overall_score),
    communicationScore: nullableNumber(row.communication_score),
    technicalScore: nullableNumber(row.technical_score),
    behavioralScore: nullableNumber(row.behavioral_score),
    jdAlignmentScore: nullableNumber(row.jd_alignment_score),
    summary: String(row.summary),
    strengths: parseStringArray(row.strengths),
    improvements: parseStringArray(row.improvements),
    stageScores: parseStageScores(row.stage_scores),
    questionEvaluations: parseQuestionEvaluations(row.question_evaluations),
    createdAt: dateString(row.created_at),
  };
}

function mapTranscriptEventRow(row: Record<string, unknown>): InterviewTranscriptEventRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    eventId: String(row.event_id),
    turnId: nullableString(row.turn_id),
    role: String(row.role) as InterviewTranscriptEventRecord['role'],
    type: String(row.type) as InterviewTranscriptEventRecord['type'],
    stage: nullableString(row.stage),
    question: nullableString(row.question),
    text: nullableString(row.text),
    metadata: parseRecord(row.metadata),
    createdAt: dateString(row.created_at),
  };
}

function mapTurnRow(row: Record<string, unknown>): InterviewTurnRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    turnId: String(row.turn_id),
    role: String(row.role) as InterviewTurnRecord['role'],
    stage: nullableString(row.stage),
    question: nullableString(row.question),
    text: String(row.text),
    metadata: parseRecord(row.metadata),
    createdAt: dateString(row.created_at),
  };
}

function mapBriefRow(row: Record<string, unknown>): InterviewBriefRecord {
  return {
    id: String(row.id),
    mode: String(row.mode) as InterviewBriefRecord['mode'],
    accessCodeHash: String(row.access_code_hash),
    title: String(row.title),
    summary: String(row.summary),
    focusAreas: parseStringArray(row.focus_areas),
    questionBank: parseStringArray(row.question_bank),
    rubric: parseRubricArray(row.rubric),
    createdAt: dateString(row.created_at),
    expiresAt: dateString(row.expires_at),
  };
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function normalizeConnectionString(value: string): string {
  if (shouldUseSsl(value)) return value.replace(/\?.*$/, '');
  return value;
}

function shouldUseSsl(value: string): boolean {
  return /sslmode=require/i.test(value) || /railway/i.test(value) || /supabase/i.test(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : value == null ? null : Number(value);
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function nullableDateString(value: unknown): string | null {
  if (value == null) return null;
  return dateString(value);
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function parseRubricArray(value: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const rec = item as Record<string, unknown>;
    return { id: String(rec.id ?? ''), name: String(rec.name ?? '') };
  });
}

function parseStageScores(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, score]) => [
      key, typeof score === 'number' ? score : Number(score),
    ]),
  );
}

function parseQuestionEvaluations(value: unknown): QuestionEvaluation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map((item) => {
    const r = item as Record<string, unknown>;
    return {
      question: String(r.question ?? ''),
      answerSummary: String(r.answerSummary ?? ''),
      score: typeof r.score === 'number' ? r.score : Number(r.score ?? 0),
      feedback: String(r.feedback ?? ''),
      improvement: String(r.improvement ?? ''),
    };
  });
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function compareCreatedAtAsc<T extends { createdAt: string }>(left: T, right: T): number {
  return left.createdAt.localeCompare(right.createdAt);
}
