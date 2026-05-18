export const config = {
  port: Number(process.env.CAREER_ENGINE_PORT ?? 4010),
  publicInterviewBaseUrl: process.env.PUBLIC_INTERVIEW_BASE_URL ?? "http://localhost:5174",
  callbackBaseUrl: process.env.CAREER_OPS_CALLBACK_BASE_URL ?? "http://localhost:4010",
  hmacSharedSecret: process.env.HMAC_SHARED_SECRET ?? "local-dev-secret-change-me",
  jwtSecret: process.env.JWT_SECRET ?? "replace-with-32-byte-secret",
  voiceSessionTtlSeconds: Number(process.env.VOICE_SESSION_TTL_SECONDS ?? 3600),
  voiceAgentBaseUrl: process.env.VOICE_AGENT_BASE_URL ?? "http://localhost:8020",
  storePath: process.env.CAREER_ENGINE_STORE_PATH ?? ".data/career-engine-store.json",
};
