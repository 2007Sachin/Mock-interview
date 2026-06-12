import type {
  PerQuestionFeedback,
  ReadinessLevel,
  Report,
  Session,
  SwotPoint,
} from '../types.js';
import { chatJson } from './groq.js';

const READINESS_LEVELS: ReadinessLevel[] = ['needs practice', 'getting there', 'interview ready'];

export async function generateReport(session: Session): Promise<Report> {
  const answered = session.turns.filter((t) => !t.skipped && t.answer);
  if (answered.length === 0) {
    return emptyReport('No questions were answered, so there is nothing to evaluate yet.');
  }

  const transcript = session.turns
    .map((t, i) =>
      t.skipped
        ? `Q${i + 1}: ${t.question}\nA: (skipped)`
        : `Q${i + 1}: ${t.question}\nA: ${t.answer ?? '(no answer)'}`,
    )
    .join('\n\n');

  const raw = await chatJson([
    {
      role: 'system',
      content:
        'You are an experienced interviewer writing an honest, encouraging evaluation of a mock interview. ' +
        'Every SWOT point must reference something specific the candidate actually said. ' +
        'Respond with a single JSON object only, with exactly these keys:\n' +
        '"overall": {"score": integer 0-100, "summary": 2-4 sentences, "readinessLevel": one of ' +
        `${JSON.stringify(READINESS_LEVELS)}},\n` +
        '"swot": {"strengths", "weaknesses", "opportunities", "threats": each an array of 2-4 objects ' +
        '{"point": one-sentence finding, "evidence": short quote or paraphrase of what the candidate said}},\n' +
        '"perQuestion": array with one entry per question, each {"question": the question text, ' +
        '"answerSummary": 1-2 sentences, "score": integer 0-10, "feedback": what was good/missing, ' +
        '"howToImprove": one concrete suggestion}. For skipped questions use score 0 and note it was skipped.',
    },
    {
      role: 'user',
      content:
        `Interview: ${session.brief.title}\n` +
        `Rubric: ${session.brief.rubric.join('; ')}\n\n` +
        `Transcript:\n${transcript}`,
    },
  ]);

  return parseReport(raw, session);
}

/** Defensive parse: any malformed piece falls back to a sensible default instead of failing. */
function parseReport(raw: string, session: Session): Report {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyReport('The evaluation could not be generated this time. Your transcripts were saved.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return emptyReport('The evaluation could not be generated this time. Your transcripts were saved.');
  }
  const obj = parsed as Record<string, unknown>;
  const overall = (obj.overall ?? {}) as Record<string, unknown>;
  const swot = (obj.swot ?? {}) as Record<string, unknown>;

  const readiness = READINESS_LEVELS.includes(overall.readinessLevel as ReadinessLevel)
    ? (overall.readinessLevel as ReadinessLevel)
    : 'getting there';

  return {
    overall: {
      score: clampInt(overall.score, 0, 100),
      summary: typeof overall.summary === 'string' ? overall.summary : '',
      readinessLevel: readiness,
    },
    swot: {
      strengths: swotPoints(swot.strengths),
      weaknesses: swotPoints(swot.weaknesses),
      opportunities: swotPoints(swot.opportunities),
      threats: swotPoints(swot.threats),
    },
    perQuestion: perQuestion(obj.perQuestion, session),
  };
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? Math.round(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function swotPoints(value: unknown): SwotPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SwotPoint[] => {
    if (typeof item === 'string') return [{ point: item, evidence: '' }];
    if (typeof item === 'object' && item !== null) {
      const o = item as Record<string, unknown>;
      if (typeof o.point === 'string') {
        return [{ point: o.point, evidence: typeof o.evidence === 'string' ? o.evidence : '' }];
      }
    }
    return [];
  });
}

function perQuestion(value: unknown, session: Session): PerQuestionFeedback[] {
  const items = Array.isArray(value) ? value : [];
  // Anchor on the actual turns so the report always covers every question asked.
  return session.turns.map((turn, i) => {
    const o = (typeof items[i] === 'object' && items[i] !== null ? items[i] : {}) as Record<string, unknown>;
    return {
      question: turn.question,
      answerSummary:
        typeof o.answerSummary === 'string'
          ? o.answerSummary
          : turn.skipped
            ? 'This question was skipped.'
            : (turn.answer ?? '').slice(0, 200),
      score: turn.skipped ? 0 : clampInt(o.score, 0, 10),
      feedback: typeof o.feedback === 'string' ? o.feedback : '',
      howToImprove: typeof o.howToImprove === 'string' ? o.howToImprove : '',
    };
  });
}

function emptyReport(summary: string): Report {
  return {
    overall: { score: 0, summary, readinessLevel: 'needs practice' },
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    perQuestion: [],
  };
}
