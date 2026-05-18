const careerBaseUrl = process.env.CAREER_ENGINE_BASE_URL ?? "http://localhost:4010";
const voiceBaseUrl = process.env.VOICE_AGENT_BASE_URL ?? "http://localhost:8020";

const sampleRequest = {
  tenant_id: "org_lumina_demo",
  student_id: "student_demo_001",
  career_ops_user_id: "co_student_demo_001",
  selected_role: {
    role_id: "role_frontend_jr",
    title: "Junior Frontend Developer",
    seniority: "Junior",
    fit_score: 86,
    fit_rationale: ["React learning history", "TypeScript coursework", "Dashboard implementation practice"],
  },
  resume: {
    resume_id: "resume_demo_001",
    version: 1,
    source: "generated_by_career_ops",
    text: "Frontend learner with React, TypeScript, Tailwind, Supabase, and LMS dashboard project experience.",
  },
  job: {
    job_description_id: "jd_demo_001",
    source_url: "https://example.com/jobs/frontend",
    title: "Junior Frontend Developer",
    company: "ExampleCo",
    summary: "Build React UI, integrate REST APIs, and collaborate with design and product teams.",
    required_skills: ["React", "TypeScript", "CSS", "REST", "Git"],
    nice_to_have_skills: ["Testing Library", "Accessibility", "GraphQL"],
  },
  preferences: {
    interview_mode: "voice_plus_workspace",
    difficulty: "adaptive",
    include_coding_stage: true,
    target_duration_minutes: 40,
  },
};

async function expectJson(response, label) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(`${label} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function main() {
  const health = await expectJson(await fetch(`${careerBaseUrl}/health`), "career health");
  console.log(`career engine ok: ${health.plugins} plugins, ${health.skills} skills`);

  const created = await expectJson(
    await fetch(`${careerBaseUrl}/v1/mock-interviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sampleRequest),
    }),
    "create mock interview",
  );
  console.log(`created interview: ${created.mock_interview_id} code=${created.access_code}`);

  const validation = await expectJson(
    await fetch(`${voiceBaseUrl}/v1/sessions/validate-access-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mock_interview_id: created.mock_interview_id,
        access_code: created.access_code,
        client: {
          timezone: "Asia/Kolkata",
          browser: "smoke-test",
          audio_supported: true,
          workspace_supported: true,
        },
      }),
    }),
    "voice validation",
  );

  if (!validation.voice_session_token?.includes(".")) {
    throw new Error("voice session token is not a signed JWT");
  }
  if (!validation.transport?.join_url?.includes("token=")) {
    throw new Error("RTVI websocket URL is missing signed token");
  }

  const reconnect = await expectJson(
    await fetch(`${voiceBaseUrl}/v1/sessions/${validation.voice_session_id}/reconnect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ voice_session_token: validation.voice_session_token }),
    }),
    "reconnect hydration",
  );

  console.log(`validated Pipecat session: ${validation.voice_session_id}`);
  console.log(`reconnect stage: ${reconnect.state.current_stage_id}`);
  console.log("Open the interview page in a browser to perform mic/audio runtime validation.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
