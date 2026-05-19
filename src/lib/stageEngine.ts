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
