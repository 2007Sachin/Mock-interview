import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See v2/server/.env.example.`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  groqApiKey: required('GROQ_API_KEY'),
  groqModel: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  groqWhisperModel: process.env.GROQ_WHISPER_MODEL ?? 'whisper-large-v3',
  storageBackend: process.env.STORAGE_BACKEND ?? 'file',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};
