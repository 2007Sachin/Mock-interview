import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { FinalReportSchema, TranscriptSegmentSchema, WorkspaceSubmissionSchema } from "@lumina/mock-interview-contracts";
import { PluginRegistry } from "@lumina/mock-interview-plugins";
import { SkillRuntime } from "@lumina/mock-interview-skills";
import { config } from "./config.js";
import { buildBootstrap } from "./planner.js";
import { id, generateAccessCode, hashAccessCode, minutesFromNow, signJwt, verifyAccessCode, verifyCallbackPayload } from "./security.js";
import { store } from "./store.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const plugins = new PluginRegistry();
const skills = new SkillRuntime();
const accessAttempts = new Map<string, { count: number; resetAt: number }>();

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function assertSignedCallback(request: FastifyRequest, reply: FastifyReply) {
  const timestamp = firstHeader(request.headers["x-mi-timestamp"]);
  const signature = firstHeader(request.headers["x-mi-signature"]);
  if (!timestamp || !signature || !verifyCallbackPayload(request.body, timestamp, signature, config.hmacSharedSecret)) {
    reply.code(401).send({ success: false, error: { message: "Invalid callback signature" } });
    return false;
  }
  return true;
}

function rateLimitKey(request: FastifyRequest, mockInterviewId: string) {
  return `${mockInterviewId}:${request.ip}`;
}

function assertAccessCodeBudget(request: FastifyRequest, reply: FastifyReply, mockInterviewId: string) {
  const key = rateLimitKey(request, mockInterviewId);
  const now = Date.now();
  const current = accessAttempts.get(key);
  if (!current || current.resetAt <= now) {
    accessAttempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (current.count >= 5) {
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
    reply.header("retry-after", retryAfterSeconds.toString());
    reply.code(429).send({ success: false, error: { message: "Too many access-code attempts. Try again later." } });
    return false;
  }
  current.count += 1;
  return true;
}

function clearAccessCodeBudget(request: FastifyRequest, mockInterviewId: string) {
  accessAttempts.delete(rateLimitKey(request, mockInterviewId));
}

app.get("/health", async () => ({
  success: true,
  data: {
    service: "lumina-career-engine",
    status: "ok",
    plugins: plugins.discover().length,
    skills: skills.discover().length,
  },
}));

app.get("/v1/capabilities", async () => ({
  success: true,
  data: {
    plugins: plugins.discover(),
    actions: plugins.actions(),
    skills: skills.discover(),
  },
}));

app.get("/v1/students/:studentId/job-matches", async (request) => {
  const { studentId } = request.params as { studentId: string };
  return {
    success: true,
    data: {
      student_id: studentId,
      jobs: [
        {
          role_id: "role_frontend_jr",
          title: "Junior Frontend Developer",
          company: "ExampleCo",
          fit_score: 86,
          fit_rationale: ["React coursework", "TypeScript experience", "Dashboard project exposure"],
        },
      ],
    },
  };
});

app.post("/v1/mock-interviews", async (request, reply) => {
  const body = request.body as Parameters<typeof buildBootstrap>[0];
  const interviewId = id("mock_iv");
  const attemptId = id("attempt");
  const accessCode = generateAccessCode();
  const bootstrap = buildBootstrap(body, interviewId, attemptId);
  const sessionLink = `${config.publicInterviewBaseUrl}/mock/${interviewId}`;

  store.insertInterview(
    {
      id: interviewId,
      tenant_id: body.tenant_id,
      student_id: body.student_id,
      career_ops_user_id: body.career_ops_user_id,
      selected_role_id: body.selected_role.role_id,
      status: "created",
      session_link: sessionLink,
      access_code_hash: hashAccessCode(accessCode),
      access_code_expires_at: minutesFromNow(60),
      bootstrap,
      created_at: new Date().toISOString(),
    },
    {
      id: attemptId,
      mock_interview_id: interviewId,
      student_id: body.student_id,
      status: "waiting_for_access_code",
      started_at: null,
      ended_at: null,
      current_stage_id: null,
      voice_agent_session_id: null,
      transcript_url: null,
      scorecard: null,
    },
  );

  return reply.code(201).send({
    success: true,
    data: {
      mock_interview_id: interviewId,
      session_link: sessionLink,
      access_code: accessCode,
      access_code_expires_at: store.interview(interviewId)?.access_code_expires_at,
      status: "created",
      stages_preview: bootstrap.stages.map((stage) => ({
        stage_id: stage.stage_id,
        title: stage.title,
        duration_seconds: stage.duration_seconds,
      })),
    },
  });
});

app.get("/v1/mock-interviews/:mockInterviewId", async (request, reply) => {
  const { mockInterviewId } = request.params as { mockInterviewId: string };
  const interview = store.interview(mockInterviewId);
  if (!interview) return reply.code(404).send({ success: false, error: { message: "Mock interview not found" } });

  return {
    success: true,
    data: {
      ...interview,
      access_code_hash: undefined,
      bootstrap: undefined,
    },
  };
});

app.get("/v1/students/:studentId/mock-interviews", async (request) => {
  const { studentId } = request.params as { studentId: string };
  return {
    success: true,
    data: store.listInterviews(studentId).map((interview) => ({
      ...interview,
      access_code_hash: undefined,
      bootstrap: undefined,
    })),
  };
});

app.post("/v1/mock-interviews/:mockInterviewId/validate-access-code", async (request, reply) => {
  const { mockInterviewId } = request.params as { mockInterviewId: string };
  const { access_code } = request.body as { access_code?: string };
  const interview = store.interview(mockInterviewId);
  if (!interview) return reply.code(404).send({ success: false, error: { message: "Mock interview not found" } });
  if (!assertAccessCodeBudget(request, reply, mockInterviewId)) return;
  if (!access_code || !verifyAccessCode(access_code, interview.access_code_hash)) {
    return reply.code(401).send({ success: false, error: { message: "Invalid access code" } });
  }
  if (Date.parse(interview.access_code_expires_at) < Date.now()) {
    return reply.code(410).send({ success: false, error: { message: "Access code expired" } });
  }

  const voiceSessionId = id("voice_sess");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const voiceSessionToken = signJwt(
    {
      sub: interview.student_id,
      student_id: interview.student_id,
      voice_session_id: voiceSessionId,
      mock_interview_id: mockInterviewId,
      attempt_id: interview.bootstrap.mock_interview.attempt_id,
      iat: nowSeconds,
      exp: nowSeconds + config.voiceSessionTtlSeconds,
    },
    config.jwtSecret,
  );
  const attempt = store.attempt(interview.bootstrap.mock_interview.attempt_id);
  if (attempt) {
    attempt.status = "ready_to_start";
    attempt.voice_agent_session_id = voiceSessionId;
    store.persist();
  }
  clearAccessCodeBudget(request, mockInterviewId);

  return {
    success: true,
    data: {
      voice_session_id: voiceSessionId,
      voice_session_token: voiceSessionToken,
      bootstrap: interview.bootstrap,
      transport: {
        type: "websocket",
        join_url: `${config.voiceAgentBaseUrl.replace(/^http/, "ws")}/v1/realtime/${voiceSessionId}?token=${encodeURIComponent(voiceSessionToken)}`,
        expires_at: minutesFromNow(60),
      },
    },
  };
});

app.post("/v1/mock-interviews/:mockInterviewId/stage-events", async (request, reply) => {
  if (!assertSignedCallback(request, reply)) return;
  const { mockInterviewId } = request.params as { mockInterviewId: string };
  const interview = store.interview(mockInterviewId);
  if (!interview) return reply.code(404).send({ success: false, error: { message: "Mock interview not found" } });
  const payload = request.body as { attempt_id: string; event_type: string; payload?: Record<string, unknown> };
  if (payload.attempt_id !== interview.bootstrap.mock_interview.attempt_id) {
    return reply.code(400).send({ success: false, error: { message: "Attempt id mismatch" } });
  }
  store.stageEvents.push({
    id: id("stage_evt"),
    mock_interview_id: mockInterviewId,
    attempt_id: payload.attempt_id,
    event_type: payload.event_type,
    payload: payload.payload ?? {},
    created_at: new Date().toISOString(),
  });
  store.persist();
  return { success: true, data: { accepted: true } };
});

app.post("/v1/mock-interviews/:mockInterviewId/transcript-events", async (request, reply) => {
  if (!assertSignedCallback(request, reply)) return;
  const segment = TranscriptSegmentSchema.parse(request.body);
  const { mockInterviewId } = request.params as { mockInterviewId: string };
  const interview = store.interview(mockInterviewId);
  if (!interview) return reply.code(404).send({ success: false, error: { message: "Mock interview not found" } });
  if (segment.mock_interview_id !== mockInterviewId) return reply.code(400).send({ success: false, error: { message: "Interview id mismatch" } });
  if (segment.attempt_id !== interview.bootstrap.mock_interview.attempt_id) return reply.code(400).send({ success: false, error: { message: "Attempt id mismatch" } });
  store.transcriptSegments.push(segment);
  store.persist();
  return { success: true, data: { accepted: true } };
});

app.post("/v1/mock-interviews/:mockInterviewId/workspace-submissions", async (request, reply) => {
  if (!assertSignedCallback(request, reply)) return;
  const submission = WorkspaceSubmissionSchema.parse(request.body);
  const { mockInterviewId } = request.params as { mockInterviewId: string };
  const interview = store.interview(mockInterviewId);
  if (!interview) return reply.code(404).send({ success: false, error: { message: "Mock interview not found" } });
  if (!interview.bootstrap.stages.some((stage) => stage.stage_id === submission.stage_id)) {
    return reply.code(400).send({ success: false, error: { message: "Stage id mismatch" } });
  }
  store.workspaceSubmissions.push(submission);
  store.persist();
  return { success: true, data: { accepted: true } };
});

app.post("/v1/mock-interviews/:mockInterviewId/final-report", async (request, reply) => {
  if (!assertSignedCallback(request, reply)) return;
  const report = FinalReportSchema.parse(request.body);
  const { mockInterviewId } = request.params as { mockInterviewId: string };
  if (report.mock_interview_id !== mockInterviewId) return reply.code(400).send({ success: false, error: { message: "Interview id mismatch" } });
  const expectedInterview = store.interview(mockInterviewId);
  if (!expectedInterview) return reply.code(404).send({ success: false, error: { message: "Mock interview not found" } });
  if (report.attempt_id !== expectedInterview.bootstrap.mock_interview.attempt_id) return reply.code(400).send({ success: false, error: { message: "Attempt id mismatch" } });
  store.reports.set(mockInterviewId, report);
  const interview = store.interview(mockInterviewId);
  if (interview) interview.status = "completed";
  const attempt = store.attempt(report.attempt_id);
  if (attempt) {
    attempt.status = "completed";
    attempt.ended_at = new Date().toISOString();
    attempt.scorecard = report;
  }
  store.persist();
  return { success: true, data: { accepted: true } };
});

app.get("/v1/mock-interviews/:mockInterviewId/report", async (request, reply) => {
  const { mockInterviewId } = request.params as { mockInterviewId: string };
  const report = store.reports.get(mockInterviewId);
  if (!report) return reply.code(404).send({ success: false, error: { message: "Report not found" } });
  return { success: true, data: report };
});

await app.listen({ host: "0.0.0.0", port: config.port });
