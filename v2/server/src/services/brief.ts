import type { Brief, Mode } from '../types.js';
import { chatJson } from './groq.js';

const QUESTION_COUNT = 8;

const MODE_CONTEXT: Record<Mode, string> = {
  skill: 'The candidate wants to be interviewed on a specific skill or topic.',
  resume: 'The candidate uploaded their resume. Interview them on their experience, projects and claims in it.',
  capstone: 'The candidate uploaded their capstone project report. Interview them on the project: decisions, architecture, trade-offs and learnings.',
};

/**
 * Generate the interview brief for a session. `input` is the skill name for
 * skill mode, or the extracted document text for resume/capstone mode.
 */
export async function generateBrief(mode: Mode, input: string): Promise<Brief> {
  const raw = await chatJson([
    {
      role: 'system',
      content:
        'You are an experienced, friendly technical interviewer preparing for a mock interview with a student. ' +
        'Respond with a single JSON object only, with exactly these keys: ' +
        '"title" (short interview title), "summary" (2-3 sentences on what the interview will cover), ' +
        `"focusAreas" (array of 3-5 short strings), "questionBank" (array of exactly ${QUESTION_COUNT} interview questions, ` +
        'ordered from warm-up to harder, each self-contained and answerable verbally in 1-3 minutes), ' +
        '"rubric" (array of 4-6 short criteria the answers will be judged on).',
    },
    {
      role: 'user',
      content: `${MODE_CONTEXT[mode]}\n\nInput:\n${input.slice(0, 12000)}`,
    },
  ]);

  return parseBrief(raw, mode, input);
}

/** Parse the LLM output defensively; fall back to a generic brief rather than failing the session. */
function parseBrief(raw: string, mode: Mode, input: string): Brief {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallbackBrief(mode, input);
  }
  if (typeof parsed !== 'object' || parsed === null) return fallbackBrief(mode, input);
  const obj = parsed as Record<string, unknown>;

  const questionBank = stringArray(obj.questionBank).slice(0, QUESTION_COUNT);
  if (questionBank.length === 0) return fallbackBrief(mode, input);

  return {
    title: typeof obj.title === 'string' && obj.title ? obj.title : 'Mock Interview',
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    focusAreas: stringArray(obj.focusAreas),
    questionBank,
    rubric: stringArray(obj.rubric),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function fallbackBrief(mode: Mode, input: string): Brief {
  const topic = mode === 'skill' ? input.slice(0, 60) : 'your background';
  return {
    title: `Mock interview: ${topic}`,
    summary: `A short mock interview covering ${topic}.`,
    focusAreas: ['Fundamentals', 'Practical experience', 'Communication'],
    questionBank: [
      `Introduce yourself and tell me about your experience with ${topic}.`,
      `What do you find most interesting about ${topic}?`,
      `Walk me through a problem you solved related to ${topic}.`,
      `What was the hardest challenge you faced with ${topic}, and how did you handle it?`,
      `How would you explain a core concept of ${topic} to a beginner?`,
      `What mistakes do people commonly make with ${topic}?`,
      `How do you keep your knowledge of ${topic} up to date?`,
      `Where do you want to grow next with ${topic}?`,
    ],
    rubric: ['Clarity', 'Depth of knowledge', 'Concrete examples', 'Structure of answers'],
  };
}
