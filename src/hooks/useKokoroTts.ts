import { useSyncExternalStore } from 'react';
import { kokoroTts } from '@/lib/kokoroTts';

export function useKokoroTts() {
  const snapshot = useSyncExternalStore(kokoroTts.subscribe, kokoroTts.getSnapshot, kokoroTts.getSnapshot);

  return {
    ...snapshot,
    init: kokoroTts.init,
    speak: kokoroTts.speak,
    stop: kokoroTts.stop,
    setVoice: kokoroTts.setVoice,
  };
}
