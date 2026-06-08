import { InterviewAnswerRecord, InterviewBrief, InterviewMode, InterviewReportDraft, InterviewSessionRecord } from '../types.js';

export class ScoringService {
  score(
    session: InterviewSessionRecord,
    answers: InterviewAnswerRecord[],
    interviewMode: InterviewMode = 'resume',
    brief?: InterviewBrief,
  ): InterviewReportDraft {
    const answerLengths = answers.map((a) => a.answerTranscript.trim().split(/\s+/).filter(Boolean).length);
    const avgLength = answerLengths.length > 0
      ? answerLengths.reduce((sum, n) => sum + n, 0) / answerLengths.length
      : 0;

    const communicationScore = clamp(55 + Math.min(avgLength, 120) * 0.2);

    if (interviewMode === 'capstone') {
      return scoreCapstone(answers, communicationScore, brief);
    }

    if (interviewMode === 'skill') {
      return scoreSkill(answers, communicationScore, brief);
    }

    return scoreResume(session, answers, communicationScore);
  }
}

// ---------------------------------------------------------------------------
// Resume mode — original heuristics, unchanged
// ---------------------------------------------------------------------------

function scoreResume(
  session: InterviewSessionRecord,
  answers: InterviewAnswerRecord[],
  communicationScore: number,
): InterviewReportDraft {
  const matchedSkillsCount = session.payload.opportunity.matchedSkills.length;
  const missingSkillsCount = session.payload.opportunity.missingSkills.length;
  const technicalScore = clamp(58 + matchedSkillsCount * 4 - missingSkillsCount * 1.5);
  const behavioralScore = clamp(60 + countKeywordHits(answers, ['ownership', 'team', 'learned', 'result']) * 4);
  const jdAlignmentScore = clamp(56 + countKeywordHits(answers, session.payload.opportunity.matchedSkills) * 3);
  const overallScore = Math.round(
    technicalScore * 0.35 + communicationScore * 0.25 + jdAlignmentScore * 0.25 + behavioralScore * 0.15,
  );

  const stageScores = buildResumeStageScores(answers, { communicationScore, technicalScore, behavioralScore, jdAlignmentScore });

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

// ---------------------------------------------------------------------------
// Capstone mode
// ---------------------------------------------------------------------------

function scoreCapstone(
  answers: InterviewAnswerRecord[],
  communicationScore: number,
  brief: InterviewBrief | undefined,
): InterviewReportDraft {
  const focusAreas = brief?.focusAreas ?? [];
  const rubricNames = (brief?.rubric ?? []).map((r) => r.name);

  const technicalScore = clamp(58 + countKeywordHits(answers, focusAreas) * 3);
  const behavioralScore = clamp(
    60 + countKeywordHits(answers, ['decided', 'designed', 'trade-off', 'tradeoff', 'improved', 'challenge', 'refactor', 'architecture']) * 4,
  );
  const jdAlignmentScore = clamp(56 + countKeywordHits(answers, rubricNames) * 3);
  const overallScore = Math.round(
    technicalScore * 0.35 + communicationScore * 0.25 + jdAlignmentScore * 0.25 + behavioralScore * 0.15,
  );

  const stageScores = buildCapstoneStageScores(answers, { communicationScore, technicalScore, behavioralScore, jdAlignmentScore });
  const titleLabel = brief?.title ?? 'the project';

  return {
    overallScore,
    communicationScore,
    technicalScore,
    behavioralScore,
    jdAlignmentScore,
    summary: `The candidate demonstrated ${qualityLabel(overallScore)} understanding of ${titleLabel}, with the clearest signals in ${topArea(focusAreas, answers)}.`,
    strengths: [
      'Articulated the project scope and purpose clearly',
      'Connected technical decisions to requirements',
    ],
    improvements: [
      'Provide more detail on trade-offs and alternatives considered',
      'Deepen reflection on what you would change with hindsight',
    ],
    stageScores,
  };
}

// ---------------------------------------------------------------------------
// Skill mode
// ---------------------------------------------------------------------------

function scoreSkill(
  answers: InterviewAnswerRecord[],
  communicationScore: number,
  brief: InterviewBrief | undefined,
): InterviewReportDraft {
  const focusAreas = brief?.focusAreas ?? [];
  const rubricNames = (brief?.rubric ?? []).map((r) => r.name);

  const technicalScore = clamp(58 + countKeywordHits(answers, focusAreas) * 3);
  const behavioralScore = clamp(
    60 + countKeywordHits(answers, ['applied', 'implemented', 'debugged', 'optimised', 'optimized', 'encountered', 'scenario', 'real']) * 4,
  );
  const jdAlignmentScore = clamp(56 + countKeywordHits(answers, rubricNames) * 3);
  const overallScore = Math.round(
    technicalScore * 0.35 + communicationScore * 0.25 + jdAlignmentScore * 0.25 + behavioralScore * 0.15,
  );

  const stageScores = buildSkillStageScores(answers, { communicationScore, technicalScore, behavioralScore, jdAlignmentScore });
  const titleLabel = brief?.title ?? 'the assessed skill';

  return {
    overallScore,
    communicationScore,
    technicalScore,
    behavioralScore,
    jdAlignmentScore,
    summary: `The candidate showed ${qualityLabel(overallScore)} depth in ${titleLabel}, with the strongest signal in ${topArea(focusAreas, answers)}.`,
    strengths: [
      'Demonstrated practical knowledge with concrete examples',
      'Explained core concepts clearly',
    ],
    improvements: [
      'Explore edge cases and failure modes in more depth',
      'Strengthen discussion of advanced or nuanced trade-offs',
    ],
    stageScores,
  };
}

// ---------------------------------------------------------------------------
// Stage score builders
// ---------------------------------------------------------------------------

function buildResumeStageScores(
  answers: InterviewAnswerRecord[],
  scores: { communicationScore: number; technicalScore: number; behavioralScore: number; jdAlignmentScore: number },
): Record<string, number> {
  const stages = new Set(answers.map((a) => a.stage));
  const result: Record<string, number> = {};
  for (const stage of stages) {
    if (stage === 'jd_technical') result[stage] = scores.technicalScore;
    else if (stage === 'behavioral') result[stage] = scores.behavioralScore;
    else if (stage === 'scenario') result[stage] = Math.round((scores.jdAlignmentScore + scores.technicalScore) / 2);
    else result[stage] = scores.communicationScore;
  }
  return result;
}

function buildCapstoneStageScores(
  answers: InterviewAnswerRecord[],
  scores: { communicationScore: number; technicalScore: number; behavioralScore: number; jdAlignmentScore: number },
): Record<string, number> {
  const CAPSTONE_STAGES = ['project_overview', 'technical_deepdive', 'design_decisions', 'reflection'] as const;
  const stageMap: Record<string, number> = {
    project_overview: scores.communicationScore,
    technical_deepdive: scores.technicalScore,
    design_decisions: Math.round((scores.technicalScore + scores.behavioralScore) / 2),
    reflection: scores.behavioralScore,
  };

  // If we have actual answer stage names (from a real session), use them as keys.
  // Fall back to all four capstone stages when no answers exist yet.
  const answerStages = new Set(answers.map((a) => a.stage).filter(Boolean));
  const stages = answerStages.size > 0
    ? [...answerStages].filter((s) => CAPSTONE_STAGES.includes(s as typeof CAPSTONE_STAGES[number]))
    : [...CAPSTONE_STAGES];
  const effectiveStages = stages.length > 0 ? stages : [...CAPSTONE_STAGES];

  const result: Record<string, number> = {};
  for (const stage of effectiveStages) {
    result[stage] = stageMap[stage] ?? scores.communicationScore;
  }
  return result;
}

function buildSkillStageScores(
  answers: InterviewAnswerRecord[],
  scores: { communicationScore: number; technicalScore: number; behavioralScore: number; jdAlignmentScore: number },
): Record<string, number> {
  const SKILL_STAGES = ['fundamentals', 'applied', 'edge_cases', 'depth'] as const;
  const stageMap: Record<string, number> = {
    fundamentals: scores.technicalScore,
    applied: Math.round((scores.technicalScore + scores.jdAlignmentScore) / 2),
    edge_cases: scores.jdAlignmentScore,
    depth: Math.round((scores.technicalScore + scores.behavioralScore) / 2),
  };

  const answerStages = new Set(answers.map((a) => a.stage).filter(Boolean));
  const stages = answerStages.size > 0
    ? [...answerStages].filter((s) => SKILL_STAGES.includes(s as typeof SKILL_STAGES[number]))
    : [...SKILL_STAGES];
  const effectiveStages = stages.length > 0 ? stages : [...SKILL_STAGES];

  const result: Record<string, number> = {};
  for (const stage of effectiveStages) {
    result[stage] = stageMap[stage] ?? scores.communicationScore;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countKeywordHits(answers: InterviewAnswerRecord[], keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const haystack = answers.map((a) => a.answerTranscript.toLowerCase()).join(' ');
  return keywords.reduce((count, kw) => count + (haystack.includes(kw.toLowerCase()) ? 1 : 0), 0);
}

function qualityLabel(score: number): string {
  if (score >= 80) return 'strong';
  if (score >= 65) return 'solid';
  if (score >= 50) return 'developing';
  return 'emerging';
}

function topArea(focusAreas: string[], answers: InterviewAnswerRecord[]): string {
  if (focusAreas.length === 0) return 'core fundamentals';
  if (answers.length === 0) return focusAreas[0];
  const haystack = answers.map((a) => a.answerTranscript.toLowerCase()).join(' ');
  const scored = focusAreas.map((area) => ({
    area,
    hits: (haystack.match(new RegExp(area.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length,
  }));
  const best = scored.reduce((a, b) => (b.hits > a.hits ? b : a), scored[0]);
  return best.hits > 0 ? best.area : focusAreas[0];
}
