import { config } from '../config.js';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

/** Thrown for any Groq API failure so routes can map it to a friendly, retryable error. */
export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

async function groqFetch(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${GROQ_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.groqApiKey}`,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GroqError(`Groq ${path} failed (${res.status}): ${body.slice(0, 500)}`, res.status);
  }
  return res.json();
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Chat completion that must return a JSON object (uses Groq's JSON mode). */
export async function chatJson(messages: ChatMessage[]): Promise<string> {
  const data = (await groqFetch('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.groqModel,
      messages,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  })) as { choices?: { message?: { content?: string } }[] };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new GroqError('Groq chat completion returned no content', 502);
  }
  return content;
}

/** Transcribe a recorded audio clip (webm/opus from MediaRecorder) with Groq-hosted Whisper. */
export async function transcribe(audio: Buffer, mimeType: string): Promise<string> {
  const form = new FormData();
  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `answer.${extension}`);
  form.append('model', config.groqWhisperModel);
  form.append('response_format', 'json');

  const data = (await groqFetch('/audio/transcriptions', {
    method: 'POST',
    body: form,
  })) as { text?: string };

  return (data.text ?? '').trim();
}
