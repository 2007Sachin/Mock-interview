import {
  InterviewAnswerRecord,
  InterviewReportDraft,
  InterviewSessionRecord,
  InterviewTranscriptEventRecord,
  InterviewTurnRecord,
} from '../types.js';

const MISTRAL_CHAT_COMPLETIONS_URL = 'https://api.mistral.ai/v1/chat/completions';
const RESUME_CONTEXT_LIMIT = 1_200;
const JD_CONTEXT_LIMIT = 1_800;
const ANSWER_LIMIT = 12;
const TURN_LIMIT = 24;
const TRANSCRIPT_EVENT_LIMIT = 40;

type ReportProvider = 'mistral' | 'mock';
type FetchLike = typeof fetch;

export interface InterviewReportGenerationInput {
  session: InterviewSessionRecord;
  answers: InterviewAnswerRecord[];
  turns: InterviewTurnRecord[];
  transcriptEvents: InterviewTranscriptEventRecord[];
}

export interface InterviewReportGenerator {
  generateReport(input: InterviewReportGenerationInput): Promise<InterviewReportDraft>;
}

type MistralInterviewServiceConfig = {
  provider?: ReportProvider;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retryCount?: number;
  fetch?: FetchLike;
};

export class MistralInterviewServiceError extends Error {
  constructor(
    public readonly code: 'disabled' | 'timeout' | 'provider' | 'validation',
    message: string,
  ) {
    super(message);
    this.name = 'MistralInterviewServiceError';
  }
}

export class MistralInterviewService implements InterviewReportGenerator {
  private readonly provider: ReportProvider;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly retryCount: number;
  private readonly fetchImplementation: FetchLike;

  constructor(config: MistralInterviewServiceConfig = {}) {
    this.provider = normalizeProvider(config.provider ?? process.env.LLM_PROVIDER);
    this.apiKey = (config.apiKey ?? process.env.MISTRAL_API_KEY ?? '').trim();
    this.model = (config.model ?? process.env.MISTRAL_LLM_MODEL ?? 'mistral-small-latest').trim();
    this.temperature = normalizeNumber(config.temperature, process.env.MISTRAL_TEMPERATURE, 0.3);
    this.maxTokens = normalizeInteger(config.maxTokens, process.env.MISTRAL_MAX_TOKENS, 1200);
    this.timeoutMs = normalizeInteger(config.timeoutMs, process.env.MISTRAL_TIMEOUT_MS, 15_000);
    this.retryCount = Math.max(0, normalizeInteger(config.retryCount, process.env.MISTRAL_RETRY_COUNT, 1));
    this.fetchImplementation = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generateReport(input: InterviewReportGenerationInput): Promise<InterviewReportDraft> {
    if (this.provider !== 'mistral' || !this.apiKey) {
      throw new MistralInterviewServiceError('disabled', 'LLM report generation is not configured.');
    }

    let attempt = 0;
    let lastError: MistralInterviewServiceError | null = null;
    while (attempt <= this.retryCount) {
      try {
        return await this.generateReportOnce(input);
      } catch (error) {
        const normalizedError = normalizeServiceError(error);
        if (normalizedError.code === 'validation' || attempt === this.retryCount) {
          throw normalizedError;
        }

        lastError = normalizedError;
        attempt += 1;
      }
    }

    throw lastError ?? new MistralInterviewServiceError('provider', 'LLM report generation failed.');
  }

  private async generateReportOnce(input: InterviewReportGenerationInput): Promise<InterviewReportDraft> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(MISTRAL_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          response_format: {
            type: 'json_object',
          },
          messages: buildPromptMessages(input),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new MistralInterviewServiceError('provider', 'LLM report generation failed.');
      }

      const payload = await response.json() as Record<string, unknown>;
      const content = extractMessageContent(payload);
      if (!content) {
        throw new MistralInterviewServiceError('validation', 'LLM report payload was empty.');
      }

      return normalizeReportDraft(parseJsonObject(content));
    } catch (error) {
      throw normalizeServiceError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildPromptMessages(input: InterviewReportGenerationInput): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        'You are a strict but fair mock interview evaluator.',
        'Return JSON only.',
        'Use only facts grounded in the supplied interview data.',
        'Do not invent evidence, do not speculate, and do not reveal or quote private resume or job-description text verbatim.',
        'All scores must be numeric from 0 to 100.',
        'Summary must be concise and non-empty.',
        'Strengths and improvements must be actionable string arrays.',
        'Stage scores must be an object with numeric 0-100 values.',
        'Prefer interview turns over legacy answers when both describe the same response.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Generate an interview report JSON object with keys overallScore, communicationScore, technicalScore, behavioralScore, jdAlignmentScore, summary, strengths, improvements, stageScores.',
        roleTitle: input.session.payload.opportunity.title,
        company: input.session.payload.opportunity.company,
        matchedSkills: input.session.payload.opportunity.matchedSkills,
        missingSkills: input.session.payload.opportunity.missingSkills,
        recommendedActions: input.session.payload.opportunity.recommendedActions,
        resumeContext: summarizeContext(input.session.payload.resume.text, RESUME_CONTEXT_LIMIT),
        jobDescriptionContext: summarizeContext(input.session.payload.opportunity.description, JD_CONTEXT_LIMIT),
        interviewStages: input.session.payload.interviewConfig.stages,
        answers: input.answers.slice(0, ANSWER_LIMIT).map((answer) => ({
          stage: answer.stage,
          question: answer.question,
          answerTranscript: answer.answerTranscript,
          createdAt: answer.createdAt,
        })),
        turns: input.turns.slice(0, TURN_LIMIT).map((turn) => ({
          role: turn.role,
          stage: turn.stage,
          question: turn.question,
          text: turn.text,
          createdAt: turn.createdAt,
        })),
        transcriptEvents: input.transcriptEvents
          .filter((event) => event.text)
          .slice(0, TRANSCRIPT_EVENT_LIMIT)
          .map((event) => ({
            role: event.role,
            type: event.type,
            stage: event.stage,
            question: event.question,
            text: event.text,
            createdAt: event.createdAt,
          })),
      }),
    },
  ];
}

function extractMessageContent(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
  const content = message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (!isRecord(item)) {
        return '';
      }

      return typeof item.text === 'string' ? item.text : '';
    })
    .join('')
    .trim();
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) {
      throw new Error('Expected JSON object.');
    }
    return parsed;
  } catch {
    throw new MistralInterviewServiceError('validation', 'LLM report payload was not valid JSON.');
  }
}

function normalizeReportDraft(payload: Record<string, unknown>): InterviewReportDraft {
  const summary = normalizeRequiredString(payload.summary, 'summary');
  const strengths = normalizeStringArray(payload.strengths, 'strengths');
  const improvements = normalizeStringArray(payload.improvements, 'improvements');
  const stageScores = normalizeStageScores(payload.stageScores);

  return {
    overallScore: normalizeScore(payload.overallScore, 'overallScore'),
    communicationScore: normalizeScore(payload.communicationScore, 'communicationScore'),
    technicalScore: normalizeScore(payload.technicalScore, 'technicalScore'),
    behavioralScore: normalizeScore(payload.behavioralScore, 'behavioralScore'),
    jdAlignmentScore: normalizeScore(payload.jdAlignmentScore, 'jdAlignmentScore'),
    summary,
    strengths,
    improvements,
    stageScores,
  };
}

function normalizeStageScores(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    throw new MistralInterviewServiceError('validation', 'stageScores must be an object.');
  }

  const entries = Object.entries(value)
    .map(([key, score]) => [key.trim(), normalizeScore(score, `stageScores.${key}`)] as const)
    .filter(([key]) => key.length > 0);

  if (entries.length === 0) {
    throw new MistralInterviewServiceError('validation', 'stageScores must include at least one stage.');
  }

  return Object.fromEntries(entries);
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new MistralInterviewServiceError('validation', `${fieldName} must be a string array.`);
  }

  const normalized = Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  ));

  if (normalized.length === 0) {
    throw new MistralInterviewServiceError('validation', `${fieldName} must not be empty.`);
  }

  return normalized;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new MistralInterviewServiceError('validation', `${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeScore(value: unknown, fieldName: string): number {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    throw new MistralInterviewServiceError('validation', `${fieldName} must be numeric.`);
  }

  const rounded = Math.round(numericValue);
  if (rounded < 0 || rounded > 100) {
    throw new MistralInterviewServiceError('validation', `${fieldName} must be between 0 and 100.`);
  }

  return rounded;
}

function summarizeContext(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function normalizeProvider(value: string | undefined): ReportProvider {
  return value?.trim().toLowerCase() === 'mistral' ? 'mistral' : 'mock';
}

function normalizeNumber(overrideValue: number | undefined, envValue: string | undefined, fallback: number): number {
  if (overrideValue !== undefined && Number.isFinite(overrideValue)) {
    return overrideValue;
  }

  const parsed = envValue == null ? Number.NaN : Number(envValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeInteger(overrideValue: number | undefined, envValue: string | undefined, fallback: number): number {
  return Math.round(normalizeNumber(overrideValue, envValue, fallback));
}

function normalizeServiceError(error: unknown): MistralInterviewServiceError {
  if (error instanceof MistralInterviewServiceError) {
    return error;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new MistralInterviewServiceError('timeout', 'LLM report generation timed out.');
  }

  return new MistralInterviewServiceError('provider', 'LLM report generation failed.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
