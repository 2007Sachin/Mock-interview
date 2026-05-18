const careerBaseUrl = process.env.CAREER_ENGINE_BASE_URL ?? "http://localhost:4010";

const sampleRequest = {
  tenant_id: "org_lumina_demo",
  student_id: "student_testing_user",
  career_ops_user_id: "co_student_test_user",
  selected_role: {
    role_id: "role_frontend_jr",
    title: "Junior Frontend Developer",
    seniority: "Junior",
    fit_score: 92,
    fit_rationale: ["Excellent React understanding", "Proficient in modern CSS/HTML", "Good JavaScript foundation"],
  },
  resume: {
    resume_id: "resume_test_user",
    version: 1,
    source: "generated_by_career_ops",
    text: "Enthusiastic Frontend developer with projects in React, TypeScript, and Tailwind CSS.",
  },
  job: {
    job_description_id: "jd_test_role",
    source_url: "https://example.com/jobs/frontend-dev",
    title: "Frontend Developer",
    company: "Lumina Labs",
    summary: "Build state-of-the-art interactive web platforms and collaborate on realtime features.",
    required_skills: ["React", "TypeScript", "Tailwind CSS", "JavaScript"],
    nice_to_have_skills: ["FastAPI", "WebSockets", "UI/UX Design"],
  },
  preferences: {
    interview_mode: "voice_plus_workspace",
    difficulty: "adaptive",
    include_coding_stage: true,
    target_duration_minutes: 30,
  },
};

async function main() {
  console.log("Generating fresh testing session from Career Engine...");
  
  const response = await fetch(`${careerBaseUrl}/v1/mock-interviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sampleRequest),
  });
  
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    console.error(`Failed to create mock interview session: ${response.status}`, payload);
    process.exit(1);
  }
  
  const data = payload.data;
  console.log("\n=======================================================");
  console.log("🚀 MOCK INTERVIEW SESSION GENERATED SUCCESSFULLY!");
  console.log("=======================================================");
  console.log(`\n🔑 Access Code   : ${data.access_code}`);
  console.log(`🆔 Interview ID  : ${data.mock_interview_id}`);
  console.log(`🔗 Web URL       : ${data.session_link}`);
  console.log("\n-------------------------------------------------------");
  console.log("💡 Instructions to test:");
  console.log("1. Open the Web URL in your browser.");
  console.log(`2. Enter the Access Code '${data.access_code}' when prompted to start.`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
