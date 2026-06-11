import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_VOICE = 'af_heart';

let ttsPromise: Promise<KokoroTTS> | null = null;
let currentAudio: HTMLAudioElement | null = null;

/** Start downloading the Kokoro model (~90 MB, cached by the browser after first load). */
export function preloadTts(): Promise<KokoroTTS> {
  ttsPromise ??= KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
  return ttsPromise;
}

/**
 * Speak `text` aloud and resolve when playback finishes. If the model fails
 * to load or audio is blocked, resolves anyway — the UI always shows the text.
 */
export async function speak(text: string): Promise<void> {
  try {
    const tts = await preloadTts();
    const audio = await tts.generate(text, { voice: DEFAULT_VOICE });
    const url = URL.createObjectURL(audio.toBlob());
    await new Promise<void>((resolve) => {
      const el = new Audio(url);
      currentAudio = el;
      el.onended = () => resolve();
      el.onerror = () => resolve();
      el.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('TTS unavailable, continuing without audio:', err);
  } finally {
    currentAudio = null;
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.dispatchEvent(new Event('ended'));
  }
}
