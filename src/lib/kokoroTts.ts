import { env } from '@/lib/env';

type KokoroRawAudio = import('@huggingface/transformers').RawAudio;

type KokoroDevice = 'wasm' | 'webgpu';
type KokoroDtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
type KokoroVoiceId = string;

type KokoroVoiceMeta = {
  name: string;
  language: string;
  gender: string;
  traits?: string;
  targetQuality: string;
  overallGrade: string;
};

type KokoroVoiceMap = Record<string, KokoroVoiceMeta>;

type KokoroInstance = {
  voices: KokoroVoiceMap;
  list_voices: () => unknown;
  generate: (text: string, options?: { voice?: KokoroVoiceId; speed?: number }) => Promise<KokoroRawAudio>;
};

type KokoroModule = {
  KokoroTTS: {
    from_pretrained: (
      modelId: string,
      options?: {
        dtype?: KokoroDtype;
        device?: KokoroDevice | null;
      },
    ) => Promise<KokoroInstance>;
  };
};

export type KokoroVoiceOption = {
  id: string;
  name: string;
  language: string;
  gender: string;
  traits?: string;
  targetQuality: string;
  overallGrade: string;
};

export type KokoroTtsSnapshot = {
  isSupported: boolean;
  isLoading: boolean;
  isReady: boolean;
  isSpeaking: boolean;
  error: string | null;
  selectedVoice: string;
  voices: KokoroVoiceOption[];
};

type QueueItem = {
  id: number;
  text: string;
  resolve: () => void;
};

const DEFAULT_SNAPSHOT: KokoroTtsSnapshot = {
  isSupported: canUseBrowserAudio(),
  isLoading: false,
  isReady: false,
  isSpeaking: false,
  error: null,
  selectedVoice: env.kokoroVoice,
  voices: [],
};

function canUseBrowserAudio() {
  return (
    typeof window !== 'undefined' &&
    typeof Audio !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

function browserHasWebGpu() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return 'gpu' in navigator;
}

function normalizeDevice(value: string): KokoroDevice {
  return value === 'webgpu' ? 'webgpu' : 'wasm';
}

function normalizeDtype(value: string): KokoroDtype {
  switch (value) {
    case 'fp32':
    case 'fp16':
    case 'q8':
    case 'q4':
    case 'q4f16':
      return value;
    default:
      return 'q8';
  }
}

function chunkText(text: string, maxChunkLength = 220) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const sentenceLikeParts = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
  const chunks: string[] = [];
  let current = '';

  const pushChunk = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
  };

  for (const part of sentenceLikeParts) {
    const sentence = part.trim();
    if (!sentence) {
      continue;
    }

    if (sentence.length > maxChunkLength) {
      if (current) {
        pushChunk(current);
        current = '';
      }

      const words = sentence.split(' ');
      let wordChunk = '';
      for (const word of words) {
        const next = wordChunk ? `${wordChunk} ${word}` : word;
        if (next.length <= maxChunkLength) {
          wordChunk = next;
          continue;
        }

        pushChunk(wordChunk);
        wordChunk = word;
      }
      pushChunk(wordChunk);
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length <= maxChunkLength) {
      current = next;
      continue;
    }

    pushChunk(current);
    current = sentence;
  }

  pushChunk(current);
  return chunks;
}

function toVoiceOptions(voices: KokoroVoiceMap): KokoroVoiceOption[] {
  return Object.entries(voices).flatMap(([id, meta]) => {
    if (!isNonEmptyString(id) || !isValidVoiceMeta(meta)) {
      return [];
    }

    return [
      {
        id,
        name: meta.name,
        language: meta.language,
        gender: meta.gender,
        traits: typeof meta.traits === 'string' ? meta.traits : undefined,
        targetQuality: meta.targetQuality,
        overallGrade: meta.overallGrade,
      },
    ];
  });
}

function isVoiceMap(value: unknown): value is KokoroVoiceMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isValidVoiceMeta(entry));
}

function extractVoiceMap(listVoicesResult: unknown) {
  if (isVoiceMap(listVoicesResult)) {
    return listVoicesResult;
  }

  if (Array.isArray(listVoicesResult)) {
    const pairs = listVoicesResult.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const candidate = entry as { id?: unknown } & KokoroVoiceMeta;
      return typeof candidate.id === 'string' ? [[candidate.id, candidate] as const] : [];
    });

    if (pairs.length > 0) {
      return Object.fromEntries(pairs);
    }
  }

  return null;
}

function listVoices(tts: KokoroInstance) {
  const result = tts.list_voices();
  return extractVoiceMap(result) ?? tts.voices;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidVoiceMeta(value: unknown): value is KokoroVoiceMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<KokoroVoiceMeta>;
  return (
    isNonEmptyString(candidate.name) &&
    isNonEmptyString(candidate.language) &&
    isNonEmptyString(candidate.gender) &&
    isNonEmptyString(candidate.targetQuality) &&
    isNonEmptyString(candidate.overallGrade) &&
    (candidate.traits === undefined || typeof candidate.traits === 'string')
  );
}

export class KokoroTtsService {
  private snapshot: KokoroTtsSnapshot = DEFAULT_SNAPSHOT;
  private listeners = new Set<() => void>();
  private modulePromise: Promise<KokoroModule> | null = null;
  private initPromise: Promise<void> | null = null;
  private tts: KokoroInstance | null = null;
  private queue: QueueItem[] = [];
  private nextQueueId = 1;
  private nextWorkerId = 1;
  private activeWorkerId: number | null = null;
  private activeWorkerToken: number | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private currentPlaybackResolve: (() => void) | null = null;
  private currentPlaybackId: number | null = null;
  private nextPlaybackId = 1;
  private currentQueueItem: QueueItem | null = null;
  private currentQueueItemWorkerId: number | null = null;
  private speakToken = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  init = async () => {
    if (!this.snapshot.isSupported) {
      this.setSnapshot({
        error: 'Kokoro TTS is unavailable in this browser.',
      });
      return;
    }

    if (this.tts) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.setSnapshot({
      isLoading: true,
      error: null,
    });

    this.initPromise = this.initializeModel()
      .then(() => {
        this.setSnapshot({
          isLoading: false,
          isReady: true,
          error: null,
        });
      })
      .catch((error: unknown) => {
        this.tts = null;
        this.setSnapshot({
          isLoading: false,
          isReady: false,
          voices: [],
          error: `Failed to load Kokoro TTS model. ${getErrorMessage(error)}`,
        });
      })
      .finally(() => {
        this.initPromise = null;
      });

    return this.initPromise;
  };

  speak = async (text: string) => {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }

    if (!this.tts) {
      this.setSnapshot({
        error: 'Kokoro TTS is not ready. Call init() before speaking.',
      });
      return;
    }

    const currentToken = this.speakToken;

    return new Promise<void>((resolve) => {
      this.queue.push({
        id: this.nextQueueId++,
        text: normalized,
        resolve,
      });

      this.ensureQueueWorker(currentToken);
    });
  };

  stop = () => {
    this.speakToken += 1;
    this.activeWorkerId = null;
    this.activeWorkerToken = null;
    this.resolvePendingQueue();
    this.stopCurrentAudio();
    this.currentQueueItem?.resolve();
    this.currentQueueItem = null;
    this.currentQueueItemWorkerId = null;
    this.setSnapshot({
      isSpeaking: false,
    });
  };

  setVoice = (voice: string) => {
    if (this.snapshot.voices.length > 0 && !this.snapshot.voices.some((item) => item.id === voice)) {
      this.setSnapshot({
        error: `Unknown Kokoro voice "${voice}".`,
      });
      return;
    }

    this.setSnapshot({
      selectedVoice: voice,
      error: null,
    });
  };

  private async initializeModel() {
    const module = await this.loadModule();
    const dtype = normalizeDtype(env.kokoroDtype);
    const requestedDevice = normalizeDevice(env.kokoroDevice);
    const deviceCandidates =
      requestedDevice === 'webgpu'
        ? browserHasWebGpu()
          ? (['webgpu', 'wasm'] as const)
          : (['wasm'] as const)
        : ([requestedDevice] as const);

    let lastError: unknown = null;

    for (const device of deviceCandidates) {
      try {
        const tts = await module.KokoroTTS.from_pretrained(env.kokoroModelId, {
          dtype,
          device,
        });

        this.tts = tts;
        const voices = toVoiceOptions(listVoices(tts));
        const selectedVoice = voices.some((voice) => voice.id === this.snapshot.selectedVoice)
          ? this.snapshot.selectedVoice
          : voices.find((voice) => voice.id === env.kokoroVoice)?.id ?? voices[0]?.id ?? env.kokoroVoice;

        this.setSnapshot({
          selectedVoice,
          voices,
          error: null,
        });
        return;
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Model initialization failed.');
  }

  private async loadModule() {
    this.modulePromise ??= (async () => {
      try {
        return (await import('kokoro-js')) as unknown as KokoroModule;
      } catch (error: unknown) {
        this.modulePromise = null;
        throw error;
      }
    })();
    return this.modulePromise;
  }

  private ensureQueueWorker(expectedToken: number) {
    if (this.activeWorkerToken === expectedToken && this.activeWorkerId !== null) {
      return;
    }

    const workerId = this.nextWorkerId++;
    this.activeWorkerId = workerId;
    this.activeWorkerToken = expectedToken;

    void this.processQueue(expectedToken, workerId).finally(() => {
      if (this.activeWorkerId === workerId) {
        this.activeWorkerId = null;
        this.activeWorkerToken = null;

        if (this.queue.length > 0) {
          this.ensureQueueWorker(this.speakToken);
        }
      }
    });
  }

  private async processQueue(expectedToken: number, workerId: number) {
    this.setSnapshot({
      isSpeaking: true,
      error: null,
    });

    try {
      while (this.queue.length > 0 && this.speakToken === expectedToken) {
        const item = this.queue.shift();
        if (!item) {
          continue;
        }

        this.currentQueueItem = item;
        this.currentQueueItemWorkerId = workerId;

        try {
          const chunks = chunkText(item.text);
          for (const chunk of chunks) {
            if (this.speakToken !== expectedToken) {
              break;
            }

            await this.playChunk(chunk, expectedToken);
          }
        } finally {
          if (this.currentQueueItemWorkerId === workerId) {
            this.currentQueueItem = null;
            this.currentQueueItemWorkerId = null;
          }
          item.resolve();
        }
      }
    } catch (error: unknown) {
      this.resolvePendingQueue();
      if (this.activeWorkerId === workerId && this.activeWorkerToken === expectedToken) {
        this.setSnapshot({
          error: `Kokoro playback failed. ${getErrorMessage(error)}`,
        });
      }
    } finally {
      if (this.activeWorkerId === workerId && this.activeWorkerToken === expectedToken) {
        this.stopCurrentAudio();
        this.setSnapshot({
          isSpeaking: false,
        });
      }
    }
  }

  private async playChunk(text: string, expectedToken: number) {
    if (!this.tts || this.speakToken !== expectedToken) {
      return;
    }

    const audio = await this.tts.generate(text, {
      voice: this.snapshot.selectedVoice as KokoroVoiceId,
    });

    if (this.speakToken !== expectedToken) {
      return;
    }

    await this.playRawAudio(audio, expectedToken);
  }

  private async playRawAudio(audio: KokoroRawAudio, expectedToken: number) {
    const blob = audio.toBlob();
    const audioUrl = URL.createObjectURL(blob);
    const player = new Audio(audioUrl);
    const playbackId = this.nextPlaybackId++;
    player.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (settled) {
          return;
        }

        settled = true;
        player.onended = null;
        player.onerror = null;
        if (this.currentPlaybackId === playbackId) {
          this.currentPlaybackResolve = null;
          this.currentAudio = null;
          this.currentPlaybackId = null;
        }

        if (this.currentAudioUrl === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          this.currentAudioUrl = null;
        } else {
          URL.revokeObjectURL(audioUrl);
        }
      };

      const finish = () => {
        cleanup();
        resolve();
      };

      const fail = () => {
        cleanup();
        reject(new Error('Unable to play generated audio.'));
      };

      this.currentAudio = player;
      this.currentAudioUrl = audioUrl;
      this.currentPlaybackId = playbackId;
      this.currentPlaybackResolve = finish;

      player.onended = finish;
      player.onerror = fail;

      player.play().catch((error) => {
        cleanup();
        reject(error);
      });

      if (this.speakToken !== expectedToken) {
        finish();
      }
    });
  }

  private stopCurrentAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }

    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    const resolve = this.currentPlaybackResolve;
    this.currentPlaybackResolve = null;
    this.currentAudio = null;
    this.currentPlaybackId = null;
    resolve?.();
  }

  private resolvePendingQueue() {
    const pending = this.queue;
    this.queue = [];

    for (const item of pending) {
      item.resolve();
    }
  }

  private setSnapshot(next: Partial<KokoroTtsSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...next,
    };

    for (const listener of this.listeners) {
      listener();
    }
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error.';
}

export const kokoroTts = new KokoroTtsService();
