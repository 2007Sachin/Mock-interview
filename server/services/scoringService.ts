import { InterviewAnswerRecord, InterviewReportDraft, InterviewSessionRecord } from '../types.js';

export class ScoringService {
  score(session: InterviewSessionRecord, answers: InterviewAnswerRecord[]): InterviewReportDraft {
    // Deterministic fallback scoring for MVP when no external AI scorer is configured.
    const answerLengths = answers.map((answer) => answer.answerTranscript.trim().split(/\s+/).filter(Boolean).length);
    const avgLength = answerLengths.length > 0
      ? answerLengths.reduce((sum, count) => sum + count, 0) / answerLengths.length
      : 0;

    const matchedSkillsCount = session.payload.opportunity.matchedSkills.length;
    const missingSkillsCount = session.payload.opportunity.missingSkills.length;
    const communicationScore = clamp(55 + Math.min(avgLength, 120) * 0.2);
    const technicalScore = clamp(58 + matchedSkillsCount * 4 - missingSkillsCount * 1.5);
    const behavioralScore = clamp(60 + countKeywordHits(answers, ['ownership', 'team', 'learned', 'result']) * 4);
    const jdAlignmentScore = clamp(56 + countKeywordHits(answers, session.payload.opportunity.matchedSkills) * 3);
    const overallScore = Math.round(
      technicalScore * 0.35 +
      communicationScore * 0.25 +
      jdAlignmentScore * 0.25 +
      behavioralScore * 0.15,
    );

    const stageScores = buildStageScores(answers, {
      communicationScore,
      technicalScore,
      behavioralScore,
      jdAlignmentScore,
    });

    return {
      overallScore,
      communicationScore,
      technicalScore,
      behavioralScore,
      jdAlignmentScore,
      summary: `The candidate showed promising alignment for ${session.payload.opportunity.title}, with the strongest signals in ${session.payload.opportunity.matchedSkills.slice(0, 2).join(' and ') || 'core fundamentals'}.`,
      strengths: [
        'Clear structure in multiple answers',
        'Evidence connected to the target role',
      ],
      improvements: [
        'Use more specific examples and metrics',
        'Strengthen depth in role-specific problem solving',
      ],
      stageScores,
    };
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countKeywordHits(answers: InterviewAnswerRecord[], keywords: string[]): number {
  const haystack = answers.map((answer) => answer.answerTranscript.toLowerCase()).join(' ');
  return keywords.reduce((count, keyword) => count + (haystack.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function buildStageScores(
  answers: InterviewAnswerRecord[],
  scores: {
    communicationScore: number;
    technicalScore: number;
    behavioralScore: number;
    jdAlignmentScore: number;
  },
): Record<string, number> {
  const stages = new Set(answers.map((answer) => answer.stage));
  const result: Record<string, number> = {};

  for (const stage of stages) {
    if (stage === 'jd_technical') result[stage] = scores.technicalScore;
    else if (stage === 'behavioral') result[stage] = scores.behavioralScore;
    else if (stage === 'scenario') result[stage] = Math.round((scores.jdAlignmentScore + scores.technicalScore) / 2);
    else result[stage] = scores.communicationScore;
  }

  return result;
}
