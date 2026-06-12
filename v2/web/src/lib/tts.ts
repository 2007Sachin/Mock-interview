import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_VOICE = 'af_heart';

let ttsPromise: Promise<KokoroTTS> | null = null;
let currentAudio: HTMLAudioElement | null = null;
// Bumped on every speak()/stopSpeaking() so stale generations cancel themselves.
let speakToken = 0;

/**
 * Start downloading the Kokoro model (~90 MB, cached by the browser after the
 * first load). Uses WebGPU when the browser supports it — much faster than
 * the WASM fallback.
 */
export function preloadTts(): Promise<KokoroTTS> {
  ttsPromise ??=
    'gpu' in navigator
      ? KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'fp32', device: 'webgpu' })
      : KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
  return ttsPromise;
}

/**
 * Speak `text` aloud and resolve when playback finishes (or is stopped).
 * Latency: the text is split into sentences and the first one starts playing
 * as soon as it is synthesized, while the rest generate in the background.
 * If the model fails to load or audio is blocked, resolves anyway — the UI
 * always shows the text.
 */
export async function speak(text: string): Promise<void> {
  const token = ++speakToken;
  try {
    const tts = await preloadTts();
    const chunks = splitSentences(text);
    let pending = tts.generate(chunks[0] ?? text, { voice: DEFAULT_VOICE });
    for (let i = 0; i < chunks.length; i += 1) {
      const audio = await pending;
      if (token !== speakToken) return;
      const next = chunks[i + 1];
      if (next !== undefined) pending = tts.generate(next, { voice: DEFAULT_VOICE });
      await play(audio.toBlob());
      if (token !== speakToken) return;
    }
  } catch (err) {
    console.warn('TTS unavailable, continuing without audio:', err);
  }
}

export function stopSpeaking(): void {
  speakToken += 1;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.dispatchEvent(new Event('ended'));
  }
}

function play(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  return new Promise<void>((resolve) => {
    const el = new Audio(url);
    currentAudio = el;
    const done = () => {
      if (currentAudio === el) currentAudio = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    el.onended = done;
    el.onerror = done;
    el.play().catch(done);
  });
}

/** Split on sentence boundaries, merging tiny fragments into their neighbor. */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  for (const part of parts) {
    const last = chunks[chunks.length - 1];
    if (last !== undefined && (last.length < 20 || part.trim().length < 20)) {
      chunks[chunks.length - 1] = last + part;
    } else {
      chunks.push(part);
    }
  }
  return chunks.map((c) => c.trim()).filter(Boolean);
}
