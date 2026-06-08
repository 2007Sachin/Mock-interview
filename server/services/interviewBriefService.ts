import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { SessionStore } from '../db/store.js';
import {
  InterviewBrief,
  InterviewBriefRecord,
  InterviewMode,
  InterviewPayload,
  InterviewSessionRecord,
} from '../types.js';
import { TokenService } from './tokenService.js';
import { BriefGenerator, BriefGeneratorInput } from './mistralBriefService.js';

const require = createRequire(import.meta.url);
type PdfParseFn = (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
const pdfParse = require('pdf-parse') as PdfParseFn;

export interface ResumeModeInput {
  resumeText: string;
  jobTitle: string;
  company?: string;
  jobDescription: string;
  matchedSkills?: string[];
  missingSkills?: string[];
}

export class InterviewBriefService {
  constructor(
    private readonly store: SessionStore,
    private readonly tokenService: TokenService,
    private readonly briefGenerator: BriefGenerator | null = null,
  ) {}

  async createFromResume(input: ResumeModeInput) {
    const brief = await this.generateBrief({
      mode: 'resume',
      resumeText: input.resumeText,
      jobTitle: input.jobTitle,
      company: input.company,
      jobDescription: input.jobDescription,
      matchedSkills: input.matchedSkills,
      missingSkills: input.missingSkills,
    });

    return this.persist('resume', brief, (sessionId) => ({
      source: 'pathwisse-lms',
      requestId: sessionId,
      user: { id: 'self-serve', name: 'Candidate', email: '', organizationId: null },
      opportunity: {
        id: `opp-${sessionId}`,
        matchId: `match-${sessionId}`,
        title: input.jobTitle,
        company: input.company ?? '',
        location: null,
        description: input.jobDescription,
        matchedSkills: input.matchedSkills ?? brief.focusAreas.slice(0, 5),
        missingSkills: input.missingSkills ?? [],
        recommendedActions: [],
      },
      resume: {
        resumeId: null,
        text: input.resumeText,
        fileName: null,
      },
      interviewConfig: {
        mode: 'voice',
        difficulty: 'entry_level',
        durationMinutes: 30,
        stages: ['introduction', 'technical', 'behavioral'],
      },
      callback: { reportWebhookUrl: '' },
    }));
  }

  async createFromPdf(pdfBuffer: Buffer) {
    let projectText: string;
    try {
      const parsed = await pdfParse(pdfBuffer);
      projectText = parsed.text;
    } catch {
      throw new Error('Unable to parse the uploaded PDF.');
    }

    if (!projectText.trim()) {
      throw new Error('The uploaded PDF contains no extractable text.');
    }

    const brief = await this.generateBrief({ mode: 'capstone', projectText });

    return this.persist('capstone', brief, (sessionId) => ({
      source: 'pathwisse-lms',
      requestId: sessionId,
      user: { id: 'self-serve', name: 'Candidate', email: '', organizationId: null },
      opportunity: {
        id: `opp-${sessionId}`,
        matchId: `match-${sessionId}`,
        title: brief.title,
        company: '',
        location: null,
        description: brief.summary,
        matchedSkills: brief.focusAreas,
        missingSkills: [],
        recommendedActions: [],
      },
      resume: { resumeId: null, text: '', fileName: null },
      interviewConfig: {
        mode: 'voice',
        difficulty: 'entry_level',
        durationMinutes: 30,
        stages: ['project_overview', 'technical_deepdive', 'design_decisions', 'reflection'],
      },
      callback: { reportWebhookUrl: '' },
    }));
  }

  async createFromSkill(skillName: string, level?: string) {
    const brief = await this.generateBrief({ mode: 'skill', skillName, level });

    return this.persist('skill', brief, (sessionId) => ({
      source: 'pathwisse-lms',
      requestId: sessionId,
      user: { id: 'self-serve', name: 'Candidate', email: '', organizationId: null },
      opportunity: {
        id: `opp-${sessionId}`,
        matchId: `match-${sessionId}`,
        title: brief.title,
        company: '',
        location: null,
        description: brief.summary,
        matchedSkills: brief.focusAreas,
        missingSkills: [],
        recommendedActions: [],
      },
      resume: { resumeId: null, text: '', fileName: null },
      interviewConfig: {
        mode: 'voice',
        difficulty: 'entry_level',
        durationMinutes: 30,
        stages: ['fundamentals', 'applied', 'edge_cases', 'depth'],
      },
      callback: { reportWebhookUrl: '' },
    }));
  }

  private async generateBrief(input: BriefGeneratorInput): Promise<InterviewBrief> {
    if (!this.shouldUseMistral() || !this.briefGenerator) {
      return generateMockBrief(input);
    }

    try {
      return await this.briefGenerator.generate(input);
    } catch {
      return generateMockBrief(input);
    }
  }

  private async persist(
    mode: InterviewMode,
    brief: InterviewBrief,
    payloadBuilder: (sessionId: string) => InterviewPayload,
  ) {
    const sessionId = randomUUID();
    const accessCode = generateAccessCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const accessCodeHash = this.tokenService.hash(accessCode);
    const now = new Date().toISOString();
    const payload = payloadBuilder(sessionId);

    const briefRecord: InterviewBriefRecord = {
      id: sessionId,
      mode,
      accessCodeHash,
      ...brief,
      createdAt: now,
      expiresAt,
    };

    const sessionRecord: InterviewSessionRecord = {
      id: sessionId,
      userId: payload.user.id,
      organizationId: payload.user.organizationId,
      opportunityId: payload.opportunity.id,
      accessCodeHash,
      status: 'created',
      payload,
      callbackUrl: payload.callback.reportWebhookUrl,
      sessionTokenHash: null,
      attemptCount: 0,
      lockedUntil: null,
      expiresAt,
      errorMessage: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };

    await Promise.all([
      this.store.insertInterviewBrief(briefRecord),
      this.store.insertSession(sessionRecord),
    ]);

    return { sessionId, accessCode, expiresAt };
  }

  private shouldUseMistral(): boolean {
    const provider = (process.env.LLM_PROVIDER ?? 'mock').trim().toLowerCase();
    const apiKey = process.env.MISTRAL_API_KEY?.trim();
    return provider === 'mistral' && Boolean(apiKey);
  }
}

function generateAccessCode(): string {
  const left = Math.floor(100 + Math.random() * 900);
  const right = Math.floor(100 + Math.random() * 900);
  return `${left}-${right}`;
}

function generateMockBrief(input: BriefGeneratorInput): InterviewBrief {
  if (input.mode === 'skill') {
    const skillName = input.skillName ?? 'the skill';
    const levelLabel = input.level ? ` (${input.level})` : '';
    return {
      title: `${skillName}${levelLabel} Interview`,
      summary: `Assessment of ${skillName} knowledge and practical application${input.level ? ` at ${input.level} level` : ''}.`,
      focusAreas: ['Core concepts', 'Practical application', 'Problem solving', 'Best practices'],
      questionBank: [
        `Explain the core principles of ${skillName}.`,
        `Describe a real problem you solved using ${skillName}.`,
        `What are the most common pitfalls when working with ${skillName}?`,
        `How does ${skillName} compare to alternatives you have used?`,
        `Walk me through how you would debug a performance issue in ${skillName}.`,
        `How do you stay current with changes to the ${skillName} ecosystem?`,
        `Describe the testing approach you use for ${skillName} code.`,
        `What trade-offs would you consider when choosing ${skillName} for a new project?`,
      ],
      rubric: [
        { id: 'conceptual_depth', name: 'Conceptual Depth' },
        { id: 'practical_experience', name: 'Practical Experience' },
        { id: 'problem_solving', name: 'Problem Solving' },
        { id: 'communication', name: 'Communication' },
      ],
    };
  }

  if (input.mode === 'capstone') {
    const lines = (input.projectText ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    const projectTitle = lines[0]?.slice(0, 120) ?? 'Capstone Project';
    return {
      title: `${projectTitle} — Project Interview`,
      summary: 'Technical interview focusing on project architecture, decisions, and implementation.',
      focusAreas: ['Architecture decisions', 'Technical implementation', 'Challenges and solutions', 'Testing and quality'],
      questionBank: [
        `Describe the overall architecture of ${projectTitle}.`,
        'What were the main technical challenges you encountered and how did you resolve them?',
        'How did you approach the database schema design?',
        'Walk me through your testing strategy and any tools you used.',
        'How does your system handle error states and edge cases?',
        'What trade-offs did you make during the design or implementation phase?',
        'How did you ensure the security of the application?',
        'What would you improve or do differently if you had more time?',
      ],
      rubric: [
        { id: 'technical_implementation', name: 'Technical Implementation' },
        { id: 'system_architecture', name: 'System Architecture' },
        { id: 'code_quality', name: 'Code Quality' },
        { id: 'problem_solving', name: 'Problem Solving' },
        { id: 'communication', name: 'Communication' },
      ],
    };
  }

  // resume mode
  const jobTitle = input.jobTitle;
  const company = input.company;
  const title = jobTitle
    ? `${jobTitle}${company ? ` at ${company}` : ''} — Interview Preparation`
    : 'Interview Preparation';

  return {
    title,
    summary: 'Interview preparation brief based on resume and job description.',
    focusAreas: ['Technical skills', 'Behavioural competencies', 'Role alignment', 'Communication'],
    questionBank: [
      'Tell me about yourself and your most relevant experience for this role.',
      'Describe a challenging technical problem you solved recently.',
      'How do you approach learning new technologies or frameworks?',
      'Tell me about a time you had to work under pressure or tight deadlines.',
      'How do you prioritise competing tasks or requirements?',
      'Describe a situation where you had to collaborate with a difficult team member.',
      'Where do you see yourself in three years and how does this role fit?',
      'Do you have any questions for us about the role or the team?',
    ],
    rubric: [
      { id: 'technical_skills', name: 'Technical Skills' },
      { id: 'behavioural_competencies', name: 'Behavioural Competencies' },
      { id: 'role_alignment', name: 'Role Alignment' },
      { id: 'communication', name: 'Communication' },
    ],
  };
}
