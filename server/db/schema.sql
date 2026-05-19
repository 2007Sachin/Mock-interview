create extension if not exists pgcrypto;

create table if not exists interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  organization_id text null,
  opportunity_id text not null,
  access_code_hash text not null,
  status text not null default 'created',
  payload jsonb not null,
  callback_url text not null,
  session_token_hash text null,
  attempt_count integer not null default 0,
  locked_until timestamptz null,
  expires_at timestamptz not null,
  error_message text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null
);

create table if not exists interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  stage text not null,
  question text not null,
  answer_transcript text not null,
  audio_url text null,
  score numeric null,
  feedback text null,
  created_at timestamptz not null default now()
);

create table if not exists interview_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  overall_score numeric not null,
  communication_score numeric null,
  technical_score numeric null,
  behavioral_score numeric null,
  jd_alignment_score numeric null,
  summary text not null,
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  stage_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists interview_reports_session_id_key
  on interview_reports(session_id);

create index if not exists interview_answers_session_id_idx
  on interview_answers(session_id);

create index if not exists interview_sessions_status_idx
  on interview_sessions(status);
