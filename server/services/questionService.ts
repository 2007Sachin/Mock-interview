import { INTERVIEW_STAGES } from '../../src/lib/stageEngine.js';
import { InterviewAnswerRecord, InterviewSessionRecord } from '../types.js';

export class QuestionService {
  nextQuestion(session: InterviewSessionRecord, stage: string, answers: InterviewAnswerRecord[]) {
    const questionNumber = answers.filter((item) => item.stage === stage).length + 1;
    const stageConfig = INTERVIEW_STAGES.find((item) => item.id === stage);
    const totalQuestionsInStage = stageConfig?.questionCount ?? 1;

    return {
      stage,
      questionNumber,
      totalQuestionsInStage,
      question: this.buildQuestion(session, stage, questionNumber),
    };
  }

  private buildQuestion(session: InterviewSessionRecord, stage: string, questionNumber: number): string {
    const payload = session.payload;
    const matched = payload.opportunity.matchedSkills.join(', ') || 'your core strengths';
    const missing = payload.opportunity.missingSkills.join(', ') || 'areas you are growing into';

    switch (stage) {
      case 'introduction':
        return `Introduce yourself for the ${payload.opportunity.title} role at ${payload.opportunity.company}.`;
      case 'resume_walkthrough':
        return questionNumber === 1
          ? 'Walk me through the most relevant project or experience from your resume.'
          : 'Which part of your background best proves you can contribute quickly in this role?';
      case 'jd_technical':
        return [
          `How would you apply ${matched} to this role?`,
          `Pick one missing skill, such as ${missing}, and explain how you would close the gap.`,
          `Describe how you would debug a difficult issue in this role.`,
          `Explain a technical decision you have made and why it was the right choice.`,
        ][questionNumber - 1] ?? 'Answer the next technical question.';
      case 'behavioral':
        return questionNumber === 1
          ? 'Tell me about a time you handled ownership or accountability under pressure.'
          : 'Describe a teamwork or conflict situation and how you resolved it.';
      case 'scenario':
        return questionNumber === 1
          ? `Imagine your first week in the ${payload.opportunity.title} role. What would you prioritize?`
          : 'How would you respond if a task was unclear but the deadline was close?';
      default:
        return 'Share any closing reflections or questions.';
    }
  }
}
