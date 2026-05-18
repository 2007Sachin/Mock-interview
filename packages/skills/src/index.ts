export type SkillScope =
  | "resume"
  | "role"
  | "behavioral"
  | "coding"
  | "system_design"
  | "workspace"
  | "scoring"
  | "reconnect";

export interface RuntimeSkill {
  id: string;
  name: string;
  scope: SkillScope;
  description: string;
  promptAddendum: string;
  capabilities: string[];
  safetyRules: string[];
}

export const coreInterviewSkills: RuntimeSkill[] = [
  {
    id: "resume-deep-dive",
    name: "Resume Deep Dive",
    scope: "resume",
    description: "Grounds questions in the candidate resume and asks evidence-based follow-ups.",
    promptAddendum:
      "Use the resume as the source of truth. Ask for concrete impact, tradeoffs, metrics, and ownership. Do not invent experience.",
    capabilities: ["resume_context", "adaptive_followup", "evidence_probe"],
    safetyRules: ["Never claim the candidate has experience not present in the resume."],
  },
  {
    id: "role-competency",
    name: "Role Competency",
    scope: "role",
    description: "Maps job description requirements into staged role-specific interview questions.",
    promptAddendum:
      "Prioritize required skills from the job description. Ask one role-specific question at a time and probe gaps kindly.",
    capabilities: ["jd_mapping", "competency_probe", "difficulty_adaptation"],
    safetyRules: ["Do not expose hidden rubric weights to the candidate."],
  },
  {
    id: "coding-workspace",
    name: "Coding Workspace",
    scope: "workspace",
    description: "Opens a collaborative coding/case workspace through UI commands and evaluates submissions.",
    promptAddendum:
      "Use workspace commands for applied tasks. Clarify requirements, but do not solve the exercise for the candidate.",
    capabilities: ["open_workspace", "workspace_submission", "solution_review"],
    safetyRules: ["Do not execute arbitrary untrusted code outside an isolated sandbox."],
  },
  {
    id: "behavioral-star",
    name: "Behavioral STAR Probe",
    scope: "behavioral",
    description: "Evaluates ownership, reflection, conflict handling, and learning mindset.",
    promptAddendum:
      "Ask for Situation, Task, Action, Result. If the answer is vague, ask for a specific example and measurable result.",
    capabilities: ["star_method", "ownership_probe", "reflection_probe"],
    safetyRules: ["Avoid protected-class or personal-life questions unrelated to the role."],
  },
  {
    id: "scorecard-synthesis",
    name: "Scorecard Synthesis",
    scope: "scoring",
    description: "Turns transcript and rubric evidence into calibrated scores and next actions.",
    promptAddendum:
      "Score only from observed evidence. Separate strengths, gaps, next actions, and retake recommendation.",
    capabilities: ["rubric_scoring", "feedback_generation", "learning_path_mapping"],
    safetyRules: ["Do not overstate certainty; mark missing evidence as insufficient signal."],
  },
  {
    id: "reconnect-recovery",
    name: "Reconnect Recovery",
    scope: "reconnect",
    description: "Hydrates the latest stage, transcript cursor, and workspace state after connection loss.",
    promptAddendum:
      "On reconnect, summarize what happened, confirm the current stage, and continue without restarting unless requested.",
    capabilities: ["state_hydration", "transcript_cursor", "workspace_snapshot"],
    safetyRules: ["Never replay private transcript content to a different authenticated user."],
  },
];

export class SkillRuntime {
  private readonly skills = new Map<string, RuntimeSkill>();

  constructor(seed: RuntimeSkill[] = coreInterviewSkills) {
    seed.forEach((skill) => this.register(skill));
  }

  register(skill: RuntimeSkill) {
    this.skills.set(skill.id, skill);
  }

  discover(scope?: SkillScope) {
    const all = [...this.skills.values()];
    return scope ? all.filter((skill) => skill.scope === scope) : all;
  }

  injectPrompt(skillIds: string[]) {
    return skillIds
      .map((id) => this.skills.get(id))
      .filter((skill): skill is RuntimeSkill => Boolean(skill))
      .map((skill) => [`# Skill: ${skill.name}`, skill.promptAddendum, `Safety: ${skill.safetyRules.join(" ")}`].join("\n"))
      .join("\n\n");
  }
}
