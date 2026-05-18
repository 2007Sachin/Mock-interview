import { BootstrapPayloadSchema, type BootstrapPayload, type InterviewStage } from "@lumina/mock-interview-contracts";
import { SkillRuntime } from "@lumina/mock-interview-skills";
import { config } from "./config.js";
import { id, signPayload } from "./security.js";

interface CreateInterviewInput {
  tenant_id: string;
  student_id: string;
  career_ops_user_id?: string;
  selected_role: {
    role_id: string;
    title: string;
    seniority: string;
    fit_score: number;
    fit_rationale?: string[];
  };
  resume: {
    resume_id: string;
    version: number;
    source?: string;
    text: string;
    skills?: string[];
    projects?: Array<{ name: string; summary: string }>;
  };
  job: {
    job_description_id: string;
    source_url?: string;
    title: string;
    company: string;
    summary: string;
    required_skills: string[];
    nice_to_have_skills?: string[];
  };
  preferences?: {
    interview_mode?: "voice" | "voice_plus_workspace" | "coding" | "behavioral" | "system_design";
    difficulty?: "easy" | "adaptive" | "hard";
    include_coding_stage?: boolean;
    target_duration_minutes?: number;
  };
}

const skillRuntime = new SkillRuntime();

function stagePrompt(skillIds: string[], base: string) {
  const injected = skillRuntime.injectPrompt(skillIds);
  return `${base}\n\n${injected}`.trim();
}

export function buildStages(input: CreateInterviewInput): InterviewStage[] {
  const includeWorkspace = input.preferences?.include_coding_stage ?? true;
  const roleTitle = input.selected_role.title;

  const stages: InterviewStage[] = [
    {
      stage_id: "stage_1",
      sequence: 1,
      type: "resume_deep_dive",
      title: "Resume Deep Dive",
      duration_seconds: 480,
      opening_message: "Let's start with your background. Please walk me through your resume and why this role interests you.",
      system_prompt: stagePrompt(
        ["resume-deep-dive"],
        "Assess the candidate's ability to explain background and connect resume experience to the target role.",
      ),
      question_bank: [
        "Walk me through your resume.",
        "Which project best demonstrates your readiness for this role?",
        "What skill gap are you actively working on?",
      ],
      rubric: {
        criteria: [
          { id: "clarity", name: "Clarity", scale: 5 },
          { id: "role_alignment", name: "Role Alignment", scale: 5 },
          { id: "evidence", name: "Evidence", scale: 5 },
        ],
      },
      completion_rules: { min_questions: 2, max_questions: 4, advance_when: "time_elapsed_or_rubric_sufficient" },
    },
    {
      stage_id: "stage_2",
      sequence: 2,
      type: "role_competency",
      title: `${roleTitle} Competency`,
      duration_seconds: 600,
      opening_message: `Now we'll move into ${roleTitle} role-specific questions.`,
      system_prompt: stagePrompt(
        ["role-competency"],
        "Evaluate job-description-specific fundamentals. Ask one question at a time and use adaptive follow-ups.",
      ),
      question_bank: [
        `What does strong execution look like for a ${roleTitle}?`,
        "How do you handle API loading, error, and empty states?",
        "Explain one technical decision that improves reliability.",
      ],
      rubric: {
        criteria: [
          { id: "technical_accuracy", name: "Technical Accuracy", scale: 5 },
          { id: "practical_reasoning", name: "Practical Reasoning", scale: 5 },
          { id: "communication", name: "Communication", scale: 5 },
        ],
      },
      completion_rules: { min_questions: 3, max_questions: 5, advance_when: "time_elapsed_or_enough_signal" },
    },
  ];

  if (includeWorkspace) {
    stages.push({
      stage_id: "stage_3",
      sequence: 3,
      type: "coding_or_case",
      title: "Applied Workspace",
      duration_seconds: 900,
      opening_message: "Next, I will open a workspace. Solve the task and explain your approach as you work.",
      system_prompt: stagePrompt(
        ["coding-workspace"],
        "Assess applied problem-solving. Open the workspace, wait for submission, ask one follow-up, then score.",
      ),
      question_bank: [],
      workspace: {
        workspace_type: input.selected_role.title.toLowerCase().includes("design") ? "system_design" : "coding",
        language: "typescript",
        title: "Coding Exercise",
        instructions: "Implement groupByStatus to return an object where keys are status values and values are arrays of items.",
        starter_code: "function groupByStatus(items: Array<{ id: string; status: string }>) {\n  // TODO\n}\n",
        timer_seconds: 900,
        submission_required: true,
        test_cases: [
          {
            name: "groups by status",
            input: "[{id:'1',status:'todo'},{id:'2',status:'done'}]",
            expected: "{ todo: [...], done: [...] }",
          },
        ],
      },
      rubric: {
        criteria: [
          { id: "correctness", name: "Correctness", scale: 5 },
          { id: "code_quality", name: "Code Quality", scale: 5 },
          { id: "explanation", name: "Explanation", scale: 5 },
        ],
      },
      completion_rules: { requires_workspace_submission: true, max_followups_after_submission: 1 },
    });
  }

  stages.push({
    stage_id: "stage_4",
    sequence: stages.length + 1,
    type: "behavioral_closing",
    title: "Behavioral + Closing",
    duration_seconds: 480,
    opening_message: "Finally, let's cover a behavioral scenario and close with feedback.",
    system_prompt: stagePrompt(
      ["behavioral-star", "scorecard-synthesis"],
      "Evaluate collaboration, ownership, learning mindset, and role motivation. End by triggering final scoring.",
    ),
    question_bank: [
      "Tell me about a time you received difficult feedback.",
      "How do you handle unclear requirements?",
      "Why should this company take a chance on you for this role?",
    ],
    rubric: {
      criteria: [
        { id: "ownership", name: "Ownership", scale: 5 },
        { id: "reflection", name: "Reflection", scale: 5 },
        { id: "culture_fit", name: "Culture Fit", scale: 5 },
      ],
    },
    completion_rules: { min_questions: 1, max_questions: 3, advance_when: "final_stage_complete" },
  });

  return stages;
}

export function buildBootstrap(input: CreateInterviewInput, interviewId: string, attemptId: string): BootstrapPayload {
  const stages = buildStages(input);
  const payloadWithoutSignature = {
    schema_version: "mock_interview_bootstrap.v1" as const,
    request_id: id("req"),
    tenant: { tenant_id: input.tenant_id, name: "Lumina Tenant" },
    student: {
      student_id: input.student_id,
      full_name: "Lumina Candidate",
      email: "candidate@example.com",
      timezone: "Asia/Kolkata",
      lifecycle_stage: "career_ready",
      career_readiness_score: 78,
    },
    mock_interview: {
      mock_interview_id: interviewId,
      attempt_id: attemptId,
      selected_role_id: input.selected_role.role_id,
      status: "ready_to_start" as const,
      target_duration_seconds: (input.preferences?.target_duration_minutes ?? 40) * 60,
      language: "en",
      mode: input.preferences?.interview_mode ?? "voice_plus_workspace",
    },
    role: {
      title: input.selected_role.title,
      seniority: input.selected_role.seniority,
      role_family: "Software Engineering",
      fit_score: input.selected_role.fit_score,
      fit_summary: input.selected_role.fit_rationale?.join(" ") ?? "Strong role alignment based on profile and job requirements.",
    },
    resume: {
      resume_id: input.resume.resume_id,
      version: input.resume.version,
      summary: input.resume.text.slice(0, 240),
      full_text: input.resume.text,
      skills: input.resume.skills ?? ["React", "TypeScript", "Supabase", "REST APIs"],
      projects: input.resume.projects ?? [],
      risk_flags: ["Needs stronger testing examples", "Needs sharper metrics"],
    },
    job: {
      job_description_id: input.job.job_description_id,
      source_url: input.job.source_url,
      company: input.job.company,
      title: input.job.title,
      summary: input.job.summary,
      responsibilities: ["Build product features", "Integrate APIs", "Collaborate cross-functionally"],
      required_skills: input.job.required_skills,
      nice_to_have_skills: input.job.nice_to_have_skills ?? [],
    },
    interview_policy: {
      record_transcript: true,
      record_audio: false,
      allow_repeat_question: true,
      max_stage_overrun_seconds: 90,
      auto_advance: true,
      candidate_can_pause: true,
      pause_limit_seconds: 180,
    },
    voice_config: {
      stt_provider: "whisper",
      llm_provider: "mistral",
      tts_provider: "kokoro",
      llm_model: process.env.MISTRAL_MODEL ?? "mistral-small-latest",
      voice_id: process.env.KOKORO_VOICE ?? "af_heart",
      speaking_style: "calm, concise, interviewer-like",
    },
    global_system_prompt:
      "You are a professional mock interviewer inside Lumina LMS. Conduct a realistic, stage-based interview. Ask one question at a time and never reveal hidden scoring rubrics.",
    stages,
    callback_urls: {
      stage_event: `${config.callbackBaseUrl}/v1/mock-interviews/${interviewId}/stage-events`,
      transcript_event: `${config.callbackBaseUrl}/v1/mock-interviews/${interviewId}/transcript-events`,
      workspace_submission: `${config.callbackBaseUrl}/v1/mock-interviews/${interviewId}/workspace-submissions`,
      final_report: `${config.callbackBaseUrl}/v1/mock-interviews/${interviewId}/final-report`,
    },
    security: {
      payload_signature: "",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 75 * 60_000).toISOString(),
    },
  };

  const payload = {
    ...payloadWithoutSignature,
    security: {
      ...payloadWithoutSignature.security,
      payload_signature: signPayload(payloadWithoutSignature, config.hmacSharedSecret),
    },
  };

  return BootstrapPayloadSchema.parse(payload);
}
