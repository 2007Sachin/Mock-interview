const rawEnv = import.meta.env as Record<string, string | undefined>;

export type VoiceAgentProvider = 'browser' | 'pipecat';
export type TtsProvider = 'browser_speech' | 'kokoro';
export type VoiceTransport = 'websocket' | 'daily';

function parseEnum<T extends string>(
  key: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value !== undefined && allowed.includes(value as T)) {
    return value as T;
  }

  if (value !== undefined) {
    console.error(`Invalid ${key} value "${value}". Falling back to "${fallback}".`);
  }

  return fallback;
}

export const env = {
  voiceAgentProvider: parseEnum('VITE_VOICE_AGENT_PROVIDER', rawEnv.VITE_VOICE_AGENT_PROVIDER, ['browser', 'pipecat'], 'browser'),
  ttsProvider: parseEnum('VITE_TTS_PROVIDER', rawEnv.VITE_TTS_PROVIDER, ['browser_speech', 'kokoro'], 'browser_speech'),
  voiceTransport: parseEnum('VITE_VOICE_TRANSPORT', rawEnv.VITE_VOICE_TRANSPORT, ['websocket', 'daily'], 'websocket'),
  kokoroModelId: rawEnv.VITE_KOKORO_MODEL_ID ?? 'onnx-community/Kokoro-82M-v1.0-ONNX',
  kokoroDtype: rawEnv.VITE_KOKORO_DTYPE ?? 'q8',
  kokoroDevice: rawEnv.VITE_KOKORO_DEVICE ?? 'wasm',
  kokoroVoice: rawEnv.VITE_KOKORO_VOICE ?? 'af_heart',
  interviewerName: rawEnv.VITE_INTERVIEWER_NAME?.trim() || 'Asha',
  serviceSecret: rawEnv.VITE_MOCK_INTERVIEW_SERVICE_SECRET ?? 'dev-secret',
} as const;
