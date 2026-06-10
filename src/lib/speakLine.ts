import { env } from '@/lib/env';
import { kokoroTts } from '@/lib/kokoroTts';

/**
 * Speaks a one-off line (interviewer intro / closing) through the active TTS
 * path: Kokoro when the Pipecat provider is configured, otherwise the
 * browser's speechSynthesis. Resolves when playback finishes; never rejects —
 * spoken niceties must not block the flow.
 */
export async function speakLine(text: string): Promise<void> {
  const line = text.trim();
  if (!line) return;

  if (env.voiceAgentProvider === 'pipecat' && kokoroTts.getSnapshot().isSupported) {
    try {
      await kokoroTts.init();
      if (kokoroTts.getSnapshot().isReady) {
        await kokoroTts.speak(line);
        return;
      }
    } catch {
      // fall through to speechSynthesis
    }
  }

  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpokenLine() {
  if (env.voiceAgentProvider === 'pipecat') {
    kokoroTts.stop();
  }
  window.speechSynthesis?.cancel();
}
