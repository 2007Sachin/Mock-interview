import { z } from "zod";

export const InterviewModeSchema = z.enum([
  "voice",
  "voice_plus_workspace",
  "coding",
  "behavioral",
  "system_design",
]);

export const WorkspaceSchema = z.object({
  workspace_type: z.enum(["coding", "case_study", "system_design"]),
  language: z.string().optional(),
  title: z.string(),
  instructions: z.string().optional(),
  prompt: z.string().optional(),
  starter_code: z.string().optional(),
  timer_seconds: z.number().int().positive(),
  submission_required: z.boolean().default(true),
  test_cases: z
    .array(
      z.object({
        name: z.string(),
        input: z.string(),
        expected: z.string(),
      }),
    )
    .default([]),
});

export const RubricCriterionSchema = z.object({
  id: z.string(),
  name: z.string(),
  scale: z.number().int().positive().default(5),
  description: z.string().optional(),
});

export const InterviewStageSchema = z.object({
  stage_id: z.string(),
  sequence: z.number().int().positive(),
  type: z.enum([
    "resume_deep_dive",
    "role_competency",
    "coding_or_case",
    "behavioral_closing",
    "system_design",
  ]),
  title: z.string(),
  duration_seconds: z.number().int().positive(),
  opening_message: z.string(),
  system_prompt: z.string(),
  question_bank: z.array(z.string()).default([]),
  workspace: WorkspaceSchema.optional(),
  rubric: z.object({
    criteria: z.array(RubricCriterionSchema),
  }),
  completion_rules: z.record(z.unknown()).default({}),
});

export const BootstrapPayloadSchema = z.object({
  schema_version: z.literal("mock_interview_bootstrap.v1"),
  request_id: z.string(),
  tenant: z.object({
    tenant_id: z.string(),
    name: z.string(),
  }),
  student: z.object({
    student_id: z.string(),
    full_name: z.string(),
    email: z.string().email().optional(),
    timezone: z.string(),
    lifecycle_stage: z.string(),
    career_readiness_score: z.number().int().min(0).max(100),
  }),
  mock_interview: z.object({
    mock_interview_id: z.string(),
    attempt_id: z.string(),
    selected_role_id: z.string(),
    status: z.enum(["ready_to_start", "active", "completed", "cancelled"]),
    target_duration_seconds: z.number().int().positive(),
    language: z.string(),
    mode: InterviewModeSchema,
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    role_family: z.string(),
    fit_score: z.number().int().min(0).max(100),
    fit_summary: z.string(),
  }),
  resume: z.object({
    resume_id: z.string(),
    version: z.number().int().positive(),
    summary: z.string(),
    full_text: z.string(),
    skills: z.array(z.string()),
    projects: z.array(z.object({ name: z.string(), summary: z.string() })).default([]),
    risk_flags: z.array(z.string()).default([]),
  }),
  job: z.object({
    job_description_id: z.string(),
    source_url: z.string().url().optional(),
    company: z.string(),
    title: z.string(),
    summary: z.string(),
    responsibilities: z.array(z.string()).default([]),
    required_skills: z.array(z.string()).default([]),
    nice_to_have_skills: z.array(z.string()).default([]),
  }),
  interview_policy: z.object({
    record_transcript: z.boolean(),
    record_audio: z.boolean(),
    allow_repeat_question: z.boolean(),
    max_stage_overrun_seconds: z.number().int().nonnegative(),
    auto_advance: z.boolean(),
    candidate_can_pause: z.boolean(),
    pause_limit_seconds: z.number().int().nonnegative(),
  }),
  voice_config: z.object({
    stt_provider: z.string(),
    llm_provider: z.string(),
    tts_provider: z.string(),
    llm_model: z.string(),
    voice_id: z.string(),
    speaking_style: z.string(),
  }),
  global_system_prompt: z.string(),
  stages: z.array(InterviewStageSchema).min(1),
  callback_urls: z.object({
    stage_event: z.string().url(),
    transcript_event: z.string().url(),
    workspace_submission: z.string().url(),
    final_report: z.string().url(),
  }),
  security: z.object({
    payload_signature: z.string(),
    issued_at: z.string(),
    expires_at: z.string(),
  }),
});

export const UiCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("open_workspace"), payload: WorkspaceSchema.extend({ stage_id: z.string() }) }),
  z.object({
    command: z.literal("stage_progress"),
    payload: z.object({
      current_stage_id: z.string(),
      current_stage_title: z.string(),
      stage_sequence: z.number().int(),
      total_stages: z.number().int(),
      remaining_seconds: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    command: z.literal("interview_completed"),
    payload: z.object({ report_url: z.string().optional(), overall_score: z.number().int().optional() }),
  }),
]);

export const WorkspaceSubmissionSchema = z.object({
  stage_id: z.string(),
  workspace_type: z.enum(["coding", "case_study", "system_design"]),
  code: z.string().optional(),
  answer_markdown: z.string().optional(),
  language: z.string().optional(),
  elapsed_seconds: z.number().int().nonnegative(),
  run_results: z
    .object({
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      logs: z.array(z.string()).default([]),
    })
    .optional(),
});

export const TranscriptSegmentSchema = z.object({
  mock_interview_id: z.string(),
  attempt_id: z.string(),
  stage_id: z.string(),
  speaker: z.enum(["candidate", "interviewer", "system"]),
  text: z.string(),
  timestamp: z.string(),
  final: z.boolean(),
});

export const FinalReportSchema = z.object({
  mock_interview_id: z.string(),
  attempt_id: z.string(),
  student_id: z.string(),
  selected_role: z.string(),
  overall_score: z.number().int().min(0).max(100),
  recommendation: z.enum(["ready", "ready_with_minor_gaps", "needs_practice", "not_ready"]),
  summary: z.string(),
  stage_results: z.array(
    z.object({
      stage_id: z.string(),
      title: z.string(),
      score: z.number().int().min(0).max(100),
      feedback: z.string(),
    }),
  ),
  skill_gaps: z.array(
    z.object({
      skill: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      recommended_learning_path_id: z.string().optional(),
    }),
  ),
  next_actions: z.array(z.string()),
  transcript_url: z.string().url().optional(),
});

export type BootstrapPayload = z.infer<typeof BootstrapPayloadSchema>;
export type InterviewStage = z.infer<typeof InterviewStageSchema>;
export type UiCommand = z.infer<typeof UiCommandSchema>;
export type WorkspaceSubmission = z.infer<typeof WorkspaceSubmissionSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type FinalReport = z.infer<typeof FinalReportSchema>;
