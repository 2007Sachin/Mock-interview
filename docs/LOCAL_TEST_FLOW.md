# Local Test Flow

1. Start dependencies:

```powershell
docker compose -f infra\docker-compose.yml up -d
```

2. Start Career Engine:

```powershell
npm run career:dev
```

3. Start Voice Agent:

```powershell
npm run voice:dev
```

For real audio provider mode, first configure `MISTRAL_API_KEY` in `.env` and install the provider extras from `services\voice-agent\requirements.txt`. See `docs\PROVIDER_SETUP.md`.

4. Start Interview Web:

```powershell
npm run dev
```

5. Create a mock interview:

```powershell
$body = @{
  tenant_id = "tenant-1"
  student_id = "user-1"
  career_ops_user_id = "co-user-1"
  selected_role = @{
    role_id = "role_frontend_jr"
    title = "Junior Frontend Developer"
    seniority = "Junior"
    fit_score = 86
    fit_rationale = @("React coursework", "TypeScript progress")
  }
  resume = @{
    resume_id = "resume-1"
    version = 1
    text = "React, TypeScript, Supabase LMS dashboard project experience."
    skills = @("React", "TypeScript", "Tailwind", "Supabase")
  }
  job = @{
    job_description_id = "jd-1"
    title = "Junior Frontend Developer"
    company = "ExampleCo"
    summary = "Build React UI, integrate REST APIs, write tests."
    required_skills = @("React", "TypeScript", "REST", "Testing")
  }
  preferences = @{
    interview_mode = "voice_plus_workspace"
    difficulty = "adaptive"
    include_coding_stage = $true
    target_duration_minutes = 40
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Post -Uri http://localhost:4010/v1/mock-interviews -Body $body -ContentType "application/json"
```

6. Open the returned `session_link`, paste the returned `access_code`, validate, then connect.

## Automated Smoke Test

After `npm run build`, start the built services without file watchers in two terminals:

```powershell
node services\career-engine\dist\server.js
```

```powershell
cd services\voice-agent
python -m uvicorn app.main:app --host 0.0.0.0 --port 8020
```

Then run:

```powershell
npm run smoke
```

The smoke test verifies create interview, access-code validation, realtime websocket events, workspace submission, signed callback persistence, final report generation, and report retrieval.
