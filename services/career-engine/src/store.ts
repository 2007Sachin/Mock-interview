import type { BootstrapPayload, FinalReport, TranscriptSegment, WorkspaceSubmission } from "@lumina/mock-interview-contracts";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type MockInterviewStatus = "created" | "active" | "completed" | "expired" | "cancelled";
export type AttemptStatus = "waiting_for_access_code" | "ready_to_start" | "active" | "completed" | "cancelled";

export interface MockInterviewRecord {
  id: string;
  tenant_id: string;
  student_id: string;
  career_ops_user_id?: string;
  selected_role_id: string;
  status: MockInterviewStatus;
  session_link: string;
  access_code_hash: string;
  access_code_expires_at: string;
  bootstrap: BootstrapPayload;
  created_at: string;
}

export interface InterviewAttemptRecord {
  id: string;
  mock_interview_id: string;
  student_id: string;
  status: AttemptStatus;
  started_at: string | null;
  ended_at: string | null;
  current_stage_id: string | null;
  voice_agent_session_id: string | null;
  transcript_url: string | null;
  scorecard: FinalReport | null;
}

export interface StageEventRecord {
  id: string;
  mock_interview_id: string;
  attempt_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface StoreSnapshot {
  interviews: MockInterviewRecord[];
  attempts: InterviewAttemptRecord[];
  transcriptSegments: TranscriptSegment[];
  workspaceSubmissions: WorkspaceSubmission[];
  stageEvents: StageEventRecord[];
  reports: Array<[string, FinalReport]>;
}

export class InMemoryCareerStore {
  readonly interviews = new Map<string, MockInterviewRecord>();
  readonly attempts = new Map<string, InterviewAttemptRecord>();
  readonly transcriptSegments: TranscriptSegment[] = [];
  readonly workspaceSubmissions: WorkspaceSubmission[] = [];
  readonly stageEvents: StageEventRecord[] = [];
  readonly reports = new Map<string, FinalReport>();

  constructor(private readonly storePath?: string) {
    this.load();
  }

  insertInterview(record: MockInterviewRecord, attempt: InterviewAttemptRecord) {
    this.interviews.set(record.id, record);
    this.attempts.set(attempt.id, attempt);
    this.persist();
  }

  interview(id: string) {
    return this.interviews.get(id);
  }

  attempt(id: string) {
    return this.attempts.get(id);
  }

  listInterviews(studentId: string) {
    return [...this.interviews.values()].filter((item) => item.student_id === studentId);
  }

  persist() {
    if (!this.storePath) return;
    const target = path.resolve(this.storePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const snapshot: StoreSnapshot = {
      interviews: [...this.interviews.values()],
      attempts: [...this.attempts.values()],
      transcriptSegments: this.transcriptSegments,
      workspaceSubmissions: this.workspaceSubmissions,
      stageEvents: this.stageEvents,
      reports: [...this.reports.entries()],
    };
    fs.writeFileSync(target, JSON.stringify(snapshot, null, 2));
  }

  private load() {
    if (!this.storePath) return;
    const target = path.resolve(this.storePath);
    if (!fs.existsSync(target)) return;
    const snapshot = JSON.parse(fs.readFileSync(target, "utf8")) as StoreSnapshot;
    for (const interview of snapshot.interviews ?? []) this.interviews.set(interview.id, interview);
    for (const attempt of snapshot.attempts ?? []) this.attempts.set(attempt.id, attempt);
    this.transcriptSegments.push(...(snapshot.transcriptSegments ?? []));
    this.workspaceSubmissions.push(...(snapshot.workspaceSubmissions ?? []));
    this.stageEvents.push(...(snapshot.stageEvents ?? []));
    for (const [id, report] of snapshot.reports ?? []) this.reports.set(id, report);
  }
}

export const store = new InMemoryCareerStore(config.storePath);
