export const INTERVIEW_STAGES = [
  {
    id: 'introduction',
    label: 'Introduction',
    questionCount: 1,
  },
  {
    id: 'resume_walkthrough',
    label: 'Resume Walkthrough',
    questionCount: 2,
  },
  {
    id: 'jd_technical',
    label: 'Technical Round',
    questionCount: 4,
  },
  {
    id: 'behavioral',
    label: 'Behavioral Round',
    questionCount: 2,
  },
  {
    id: 'scenario',
    label: 'Scenario Round',
    questionCount: 2,
  },
  {
    id: 'closing_feedback',
    label: 'Closing Feedback',
    questionCount: 0,
  },
] as const;

export type InterviewStageId = (typeof INTERVIEW_STAGES)[number]['id'];

/** Total question count for a stage list, used when no brief questionBank exists. */
export function countStageQuestions(stages: string[]): number {
  const total = stages.reduce((sum, stageId) => {
    const stage = INTERVIEW_STAGES.find((item) => item.id === stageId);
    return sum + (stage?.questionCount ?? 0);
  }, 0);
  return total || 8;
}
