import { InterviewBrief, InterviewMode } from '../types.js';

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TEXT_CONTEXT_LIMIT = 6_000;
const QUESTION_BANK_SIZE = 8;

type FetchLike = typeof fetch;

export interface BriefGeneratorInput {
  mode: InterviewMode;
  resumeText?: string;
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  projectText?: string;
  skillName?: string;
  level?: string;
}

export interface BriefGenerator {
  generate(input: BriefGeneratorInput): Promise<InterviewBrief>;
}

type GroqBriefServiceConfig = {
  provider?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retryCount?: number;
  fetch?: FetchLike;
};

export class GroqBriefServiceError extends Error {
  constructor(
    public readonly code: 'disabled' | 'timeout' | 'provider' | 'validation',
    message: string,
  ) {
    super(message);
    this.name = 'GroqBriefServiceError';
  }
}

export class GroqBriefService implements BriefGenerator {
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly retryCount: number;
  private readonly fetchImplementation: FetchLike;

  constructor(config: GroqBriefServiceConfig = {}) {
    this.provider = normalizeProvider(config.provider ?? process.env.LLM_PROVIDER);
    this.apiKey = (config.apiKey ?? process.env.GROQ_API_KEY ?? '').trim();
    this.model = (config.model ?? process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant').trim();
    this.temperature = normalizeNumber(config.temperature, process.env.GROQ_TEMPERATURE, 0.3);
    this.maxTokens = normalizeInteger(config.maxTokens, process.env.GROQ_MAX_TOKENS, 1200);
    this.timeoutMs = normalizeInteger(config.timeoutMs, process.env.GROQ_TIMEOUT_MS, 15_000);
    this.retryCount = Math.max(0, normalizeInteger(config.retryCount, process.env.GROQ_RETRY_COUNT, 1));
    this.fetchImplementation = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generate(input: BriefGeneratorInput): Promise<InterviewBrief> {
    if (this.provider !== 'groq' || !this.apiKey) {
      throw new GroqBriefServiceError('disabled', 'Brief LLM generation is not configured.');
    }

    let attempt = 0;
    let lastError: GroqBriefServiceError | null = null;
    while (attempt <= this.retryCount) {
      try {
        return await this.generateOnce(input);
      } catch (error) {
        const normalizedError = normalizeServiceError(error);
        if (normalizedError.code === 'validation' || attempt === this.retryCount) {
          throw normalizedError;
        }
        lastError = normalizedError;
        attempt += 1;
      }
    }

    throw lastError ?? new GroqBriefServiceError('provider', 'Brief LLM generation failed.');
  }

  private async generateOnce(input: BriefGeneratorInput): Promise<InterviewBrief> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          response_format: { type: 'json_object' },
          messages: buildPromptMessages(input),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new GroqBriefServiceError('provider', 'Brief LLM generation failed.');
      }

      const payload = await response.json() as Record<string, unknown>;
      const content = extractMessageContent(payload);
      if (!content) {
        throw new GroqBriefServiceError('validation', 'Brief LLM payload was empty.');
      }

      return normalizeInterviewBrief(parseJsonObject(content));
    } catch (error) {
      throw normalizeServiceError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildPromptMessages(input: BriefGeneratorInput): Array<{ role: 'system' | 'user'; content: string }> {
  const systemLines = [
    'You are an expert interview preparation specialist.',
    'Return JSON only.',
    'Use only information supplied in the prompt.',
    `questionBank must contain exactly ${QUESTION_BANK_SIZE} interview questions tailored to the context.`,
    'focusAreas must be a non-empty string array of preparation themes.',
    'rubric must be an array of objects each with a short kebab-case "id" and a human-readable "name".',
  ];

  let taskDescription: string;
  let contextPayload: Record<string, unknown>;

  if (input.mode === 'resume') {
    taskDescription = 'Generate a JSON interview brief for a candidate applying to this role.';
    contextPayload = {
      jobTitle: input.jobTitle,
      company: input.company,
      jobDescription: summarizeContext(input.jobDescription ?? '', TEXT_CONTEXT_LIMIT),
      resumeText: summarizeContext(input.resumeText ?? '', TEXT_CONTEXT_LIMIT),
      matchedSkills: input.matchedSkills ?? [],
      missingSkills: input.missingSkills ?? [],
    };
  } else if (input.mode === 'capstone') {
    taskDescription = 'Generate a JSON interview brief for a capstone project presentation. Questions should probe technical decisions, architecture, and challenges.';
    contextPayload = {
      projectText: summarizeContext(input.projectText ?? '', TEXT_CONTEXT_LIMIT),
    };
  } else {
    taskDescription = `Generate a JSON interview brief for a ${input.level ?? 'general'} ${input.skillName} skill assessment.`;
    contextPayload = {
      skillName: input.skillName,
      level: input.level ?? 'general',
    };
  }

  return [
    {
      role: 'system',
      content: systemLines.join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: `${taskDescription} Return a JSON object with keys: title (string), summary (string), focusAreas (string[]), questionBank (array of exactly ${QUESTION_BANK_SIZE} strings), rubric (array of {id: string, name: string}).`,
        ...contextPayload,
      }),
    },
  ];
}

function extractMessageContent(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
  const content = message?.content;

  if (typeof content === 'string') return content;

  if (!Array.isArray(content)) return '';

  return content
    .map((item) => (isRecord(item) && typeof item.text === 'string' ? item.text : ''))
    .join('')
    .trim();
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) throw new Error('Expected JSON object.');
    return parsed;
  } catch {
    throw new GroqBriefServiceError('validation', 'Brief LLM payload was not valid JSON.');
  }
}

function normalizeInterviewBrief(payload: Record<string, unknown>): InterviewBrief {
  return {
    title: normalizeRequiredString(payload.title, 'title'),
    summary: normalizeRequiredString(payload.summary, 'summary'),
    focusAreas: normalizeStringArray(payload.focusAreas, 'focusAreas'),
    questionBank: normalizeQuestionBank(payload.questionBank),
    rubric: normalizeRubric(payload.rubric),
  };
}

function normalizeQuestionBank(value: unknown): string[] {
  const questions = normalizeStringArray(value, 'questionBank');
  if (questions.length < QUESTION_BANK_SIZE) {
    throw new GroqBriefServiceError(
      'validation',
      `questionBank must contain at least ${QUESTION_BANK_SIZE} questions, got ${questions.length}.`,
    );
  }
  return questions.slice(0, QUESTION_BANK_SIZE);
}

function normalizeRubric(value: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new GroqBriefServiceError('validation', 'rubric must be a non-empty array.');
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new GroqBriefServiceError('validation', `rubric[${index}] must be an object.`);
    }
    return {
      id: normalizeRequiredString(item.id, `rubric[${index}].id`),
      name: normalizeRequiredString(item.name, `rubric[${index}].name`),
    };
  });
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new GroqBriefServiceError('validation', `${fieldName} must be a string array.`);
  }
  const normalized = Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  ));
  if (normalized.length === 0) {
    throw new GroqBriefServiceError('validation', `${fieldName} must not be empty.`);
  }
  return normalized;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new GroqBriefServiceError('validation', `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function summarizeContext(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function normalizeProvider(value: string | undefined): string {
  return value?.trim().toLowerCase() === 'groq' ? 'groq' : 'mock';
}

function normalizeNumber(overrideValue: number | undefined, envValue: string | undefined, fallback: number): number {
  if (overrideValue !== undefined && Number.isFinite(overrideValue)) return overrideValue;
  const parsed = envValue == null ? Number.NaN : Number(envValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeInteger(overrideValue: number | undefined, envValue: string | undefined, fallback: number): number {
  return Math.round(normalizeNumber(overrideValue, envValue, fallback));
}

function normalizeServiceError(error: unknown): GroqBriefServiceError {
  if (error instanceof GroqBriefServiceError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new GroqBriefServiceError('timeout', 'Brief LLM generation timed out.');
  }
  return new GroqBriefServiceError('provider', 'Brief LLM generation failed.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
