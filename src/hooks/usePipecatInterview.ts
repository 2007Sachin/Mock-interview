import { useEffect, useRef, useState } from 'react';
import { PipecatClient, type BotOutputData, type MediaState, type TranscriptData } from '@pipecat-ai/client-js';
import { DailyTransport } from '@pipecat-ai/daily-transport';
import { useKokoroTts } from '@/hooks/useKokoroTts';
import { env } from '@/lib/env';
import { ApiRequestError, connectInterviewVoice } from '@/lib/mockInterviewApi';
import { formatSessionStorageKey } from '@/lib/signature';
import type {
  InterviewProviderMetadata,
  PipecatBrowserEvent,
  PipecatConnectionStatus,
} from '@/types/interview';

const PROVIDER_PLACEHOLDERS: InterviewProviderMetadata = {
  sttProvider: 'pending-backend',
  sttModel: 'pending-backend',
  llmProvider: 'pending-backend',
  llmModel: 'pending-backend',
  ttsProvider: 'kokoro-local',
  ttsModel: 'browser-kokoro',
};

type UsePipecatInterviewOptions = {
  sessionId: string;
  currentStage: string;
  currentQuestion: string;
  onManualFallbackSubmit?: (transcript: string) => Promise<void>;
};

type PipecatTransportType = 'websocket' | 'daily';

type VoiceConnectPayloadBase = {
  sessionId: string;
  candidateName: string;
  roleTitle: string;
  company: string;
  stages: string[];
  transport: PipecatTransportType;
  currentStage?: string | null;
  currentQuestion?: string | null;
};

type WebsocketInterviewVoiceConnectPayload = VoiceConnectPayloadBase & {
  transport: 'websocket';
  voiceToken: string;
  pipecatConnectUrl: string;
};

type DailyInterviewVoiceConnectPayload = VoiceConnectPayloadBase & {
  transport: 'daily';
  connectParams: Record<string, unknown> | null;
  setupError: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Unexpected Pipecat interview error.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPipecatBrowserEvent(value: unknown): value is PipecatBrowserEvent {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'user_interim_transcript':
      return (
        typeof value.eventId === 'string' &&
        typeof value.sessionId === 'string' &&
        typeof value.stage === 'string' &&
        typeof value.text === 'string' &&
        typeof value.sttProvider === 'string' &&
        typeof value.sttModel === 'string' &&
        typeof value.createdAt === 'string'
      );
    case 'user_final_transcript':
      return (
        typeof value.eventId === 'string' &&
        typeof value.turnId === 'string' &&
        typeof value.sessionId === 'string' &&
        typeof value.stage === 'string' &&
        typeof value.question === 'string' &&
        typeof value.text === 'string' &&
        typeof value.sttProvider === 'string' &&
        typeof value.sttModel === 'string' &&
        typeof value.createdAt === 'string'
      );
    case 'assistant_text':
      return (
        typeof value.eventId === 'string' &&
        typeof value.turnId === 'string' &&
        typeof value.sessionId === 'string' &&
        typeof value.stage === 'string' &&
        typeof value.question === 'string' &&
        typeof value.text === 'string' &&
        typeof value.llmProvider === 'string' &&
        typeof value.llmModel === 'string' &&
        typeof value.ttsProvider === 'string' &&
        typeof value.createdAt === 'string'
      );
    case 'bot_thinking':
      return typeof value.sessionId === 'string' && typeof value.isThinking === 'boolean';
    case 'error':
      return (
        typeof value.eventId === 'string' &&
        typeof value.sessionId === 'string' &&
        typeof value.code === 'string' &&
        typeof value.message === 'string' &&
        typeof value.createdAt === 'string'
      );
    case 'interview_complete':
      return (
        typeof value.eventId === 'string' &&
        typeof value.sessionId === 'string' &&
        typeof value.createdAt === 'string'
      );
    default:
      return false;
  }
}

function extractBrowserEvent(value: unknown) {
  if (isPipecatBrowserEvent(value)) {
    return value;
  }

  if (isRecord(value) && isPipecatBrowserEvent(value.event)) {
    return value.event;
  }

  return null;
}

function withPartialProviderMetadata(next: Partial<InterviewProviderMetadata>): InterviewProviderMetadata {
  return {
    sttProvider: next.sttProvider ?? PROVIDER_PLACEHOLDERS.sttProvider,
    sttModel: next.sttModel ?? PROVIDER_PLACEHOLDERS.sttModel,
    llmProvider: next.llmProvider ?? PROVIDER_PLACEHOLDERS.llmProvider,
    llmModel: next.llmModel ?? PROVIDER_PLACEHOLDERS.llmModel,
    ttsProvider: next.ttsProvider ?? PROVIDER_PLACEHOLDERS.ttsProvider,
    ttsModel: next.ttsModel ?? PROVIDER_PLACEHOLDERS.ttsModel,
  };
}

function getMicPermissionStatus(mediaState: MediaState | null) {
  if (!mediaState) {
    return 'unknown';
  }

  switch (mediaState.mic.state) {
    case 'granted':
      return 'granted';
    case 'initializing':
      return 'requesting';
    case 'uninitialized':
      return 'not_requested';
    case 'error':
      return mediaState.mic.reason === 'blocked' ? 'blocked' : 'error';
  }
}

export function usePipecatInterview({
  sessionId,
  currentStage,
  currentQuestion,
  onManualFallbackSubmit,
}: UsePipecatInterviewOptions) {
  const kokoro = useKokoroTts();
  const clientRef = useRef<PipecatClient | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const lastSpokenAssistantTextRef = useRef('');
  const kokoroRef = useRef({
    isReady: kokoro.isReady,
    speak: kokoro.speak,
  });
  const [connectionStatus, setConnectionStatus] = useState<PipecatConnectionStatus>('idle');
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [transportBotSpeaking, setTransportBotSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [resolvedStage, setResolvedStage] = useState(currentStage);
  const [resolvedQuestion, setResolvedQuestion] = useState(currentQuestion);
  const [transport, setTransport] = useState<PipecatTransportType>(env.voiceTransport);
  const [providerMetadata, setProviderMetadata] = useState<InterviewProviderMetadata>(PROVIDER_PLACEHOLDERS);
  const [micPermissionStatus, setMicPermissionStatus] = useState('not_requested');
  const [error, setError] = useState('');

  useEffect(() => {
    kokoroRef.current = {
      isReady: kokoro.isReady,
      speak: kokoro.speak,
    };
  }, [kokoro.isReady, kokoro.speak]);

  useEffect(() => {
    setResolvedStage(currentStage);
  }, [currentStage]);

  useEffect(() => {
    setResolvedQuestion(currentQuestion);
  }, [currentQuestion]);

  useEffect(() => {
    return () => {
      void clientRef.current?.disconnect();
      clientRef.current = null;
      websocketRef.current?.close();
      websocketRef.current = null;
    };
  }, []);

  const speakAssistantText = (text: string, force = false) => {
    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    if (!force && lastSpokenAssistantTextRef.current === nextText) {
      return;
    }

    lastSpokenAssistantTextRef.current = nextText;

    if (!kokoroRef.current.isReady) {
      return;
    }

    void kokoroRef.current.speak(nextText).catch((speechError) => {
      setError(`Unable to speak assistant response locally. ${getErrorMessage(speechError)}`);
    });
  };

  const applyBrowserEvent = (event: PipecatBrowserEvent) => {
    switch (event.type) {
      case 'user_interim_transcript':
        setResolvedStage(event.stage);
        setProviderMetadata((previous) =>
          withPartialProviderMetadata({
            ...previous,
            sttProvider: event.sttProvider,
            sttModel: event.sttModel,
          }),
        );
        setInterimTranscript(event.text);
        return;
      case 'user_final_transcript':
        setResolvedStage(event.stage);
        setResolvedQuestion(event.question);
        setProviderMetadata((previous) =>
          withPartialProviderMetadata({
            ...previous,
            sttProvider: event.sttProvider,
            sttModel: event.sttModel,
          }),
        );
        setInterimTranscript('');
        setFinalTranscript(event.text);
        return;
      case 'assistant_text':
        setResolvedStage(event.stage);
        setResolvedQuestion(event.question);
        setProviderMetadata((previous) =>
          withPartialProviderMetadata({
            ...previous,
            llmProvider: event.llmProvider,
            llmModel: event.llmModel,
            ttsProvider: event.ttsProvider,
          }),
        );
        setAssistantTranscript(event.text);
        speakAssistantText(event.text);
        return;
      case 'bot_thinking':
        setBotThinking(event.isThinking);
        return;
      case 'error':
        setError(`${event.code}: ${event.message}`);
        return;
      case 'interview_complete':
        setBotThinking(false);
        return;
    }
  };

  const ensureClient = () => {
    if (clientRef.current) {
      return clientRef.current;
    }

    const client = new PipecatClient({
      transport: new DailyTransport(),
      enableMic: true,
      enableCam: false,
      callbacks: {
        onConnected: () => {
          setConnectionStatus('connected');
          setError('');
        },
        onDisconnected: () => {
          setConnectionStatus('disconnected');
          setUserSpeaking(false);
          setBotThinking(false);
          setTransportBotSpeaking(false);
        },
        onTransportStateChanged: (state) => {
          setConnectionStatus(state);
        },
        onMediaStateChanged: (mediaState) => {
          setMicPermissionStatus(getMicPermissionStatus(mediaState));
        },
        onUserStartedSpeaking: () => {
          setUserSpeaking(true);
        },
        onUserStoppedSpeaking: () => {
          setUserSpeaking(false);
        },
        onBotStartedSpeaking: () => {
          setTransportBotSpeaking(true);
        },
        onBotStoppedSpeaking: () => {
          setTransportBotSpeaking(false);
        },
        onBotLlmStarted: () => {
          setBotThinking(true);
        },
        onBotLlmStopped: () => {
          setBotThinking(false);
        },
        onUserTranscript: (data: TranscriptData) => {
          if (data.final) {
            setInterimTranscript('');
            setFinalTranscript(data.text);
            return;
          }

          setInterimTranscript(data.text);
        },
        onBotOutput: (data: BotOutputData) => {
          if (!data.text.trim()) {
            return;
          }

          setAssistantTranscript(data.text);

          if (data.aggregated_by === 'sentence' || data.spoken) {
            speakAssistantText(data.text);
          }
        },
        onServerMessage: (data: unknown) => {
          const event = extractBrowserEvent(data);
          if (event) {
            applyBrowserEvent(event);
          }
        },
        onError: (message: unknown) => {
          const messageText =
            isRecord(message) && typeof message.data === 'string'
              ? message.data
              : getErrorMessage(message);

          setConnectionStatus('error');
          setError(`Pipecat client error: ${messageText}`);
        },
      },
    });

    clientRef.current = client;
    return client;
  };

  const connectWebsocketTransport = async (voiceConnect: WebsocketInterviewVoiceConnectPayload) => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      setConnectionStatus('connected');
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(
        `${voiceConnect.pipecatConnectUrl}?token=${encodeURIComponent(voiceConnect.voiceToken)}`,
      );

      socket.onopen = () => {
        websocketRef.current = socket;
        setConnectionStatus('connected');
        setMicPermissionStatus('not_requested');
        setError('');
        resolve();
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as unknown;
          const browserEvent = extractBrowserEvent(parsed);
          if (browserEvent) {
            applyBrowserEvent(browserEvent);
          }
        } catch {
          setError('Received an invalid websocket event payload from the voice service.');
        }
      };

      socket.onerror = () => {
        setConnectionStatus('error');
        reject(new Error('Local websocket transport failed to connect.'));
      };

      socket.onclose = () => {
        if (websocketRef.current === socket) {
          websocketRef.current = null;
        }
        setUserSpeaking(false);
        setBotThinking(false);
        setTransportBotSpeaking(false);
        setConnectionStatus('disconnected');
      };
    });
  };

  const connect = async () => {
    if (!sessionId) {
      const nextError = 'Session id missing. Reopen the interview room.';
      setError(nextError);
      throw new Error(nextError);
    }

    const sessionToken = sessionStorage.getItem(formatSessionStorageKey(sessionId)) ?? '';
    if (!sessionToken) {
      const nextError = 'Session token missing. Reopen the interview room.';
      setError(nextError);
      throw new Error(nextError);
    }

    setError('');

    try {
      const voiceConnect = await connectInterviewVoice(sessionId, sessionToken) as
        | WebsocketInterviewVoiceConnectPayload
        | DailyInterviewVoiceConnectPayload;
      setTransport(voiceConnect.transport);
      setResolvedStage(voiceConnect.currentStage ?? currentStage);
      setResolvedQuestion(voiceConnect.currentQuestion ?? currentQuestion);
      if (voiceConnect.transport === 'daily') {
        const client = ensureClient();
        const dailyVoiceConnect = voiceConnect as DailyInterviewVoiceConnectPayload;
        if (dailyVoiceConnect.setupError) {
          throw new Error(dailyVoiceConnect.setupError);
        }
        if (!dailyVoiceConnect.connectParams) {
          throw new Error('Daily transport is configured, but the connect payload is unavailable.');
        }

        await client.initDevices();
        setMicPermissionStatus(getMicPermissionStatus(client.mediaState));
        await client.connect(
          dailyVoiceConnect.connectParams as NonNullable<Parameters<PipecatClient['connect']>[0]>,
        );
        return;
      }

      await connectWebsocketTransport(voiceConnect as WebsocketInterviewVoiceConnectPayload);
    } catch (connectError) {
      const nextError =
        connectError instanceof ApiRequestError && connectError.status === 404
          ? 'Voice connect endpoint is not available yet. Expected /voice/connect to return transport-specific connection parameters.'
          : `Unable to connect the Pipecat interview. ${getErrorMessage(connectError)}`;

      setConnectionStatus('error');
      setMicPermissionStatus(clientRef.current ? getMicPermissionStatus(clientRef.current.mediaState) : 'not_requested');
      setError(nextError);
      throw new Error(nextError);
    }
  };

  const disconnect = async () => {
    setError('');
    setBotThinking(false);
    setUserSpeaking(false);
    setTransportBotSpeaking(false);
    setMicPermissionStatus(clientRef.current ? getMicPermissionStatus(clientRef.current.mediaState) : 'not_requested');
    await kokoro.stop();

    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    if (!clientRef.current) {
      setConnectionStatus('idle');
      return;
    }

    try {
      await clientRef.current.disconnect();
    } finally {
      clientRef.current = null;
      setConnectionStatus('idle');
    }
  };

  const startInterview = async () => {
    setError('');

    if (!resolvedQuestion.trim()) {
      const nextError = 'No interview question is loaded yet.';
      setError(nextError);
      throw new Error(nextError);
    }

    if (!clientRef.current || connectionStatus === 'idle' || connectionStatus === 'disconnected') {
      await connect();
    }

    if (!kokoro.isReady) {
      const nextError = 'Enable audio before starting the interview so Kokoro can speak assistant text locally.';
      setError(nextError);
      throw new Error(nextError);
    }

    setAssistantTranscript(resolvedQuestion);
    speakAssistantText(resolvedQuestion, true);
  };

  const submitManualAnswer = async (text: string) => {
    const nextText = text.trim();
    if (!nextText) {
      const nextError = 'Enter a manual answer before submitting.';
      setError(nextError);
      throw new Error(nextError);
    }

    if (!onManualFallbackSubmit) {
      const nextError =
        'Manual fallback submit handler is unavailable. The future /voice/manual-turn endpoint is typed but not active in this frontend task.';
      setError(nextError);
      throw new Error(nextError);
    }

    setError('');

    if (transport === 'websocket' && websocketRef.current?.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'user_final_transcript',
        text: nextText,
        stage: resolvedStage,
        question: resolvedQuestion,
        createdAt: new Date().toISOString(),
      }));
      setInterimTranscript('');
      setFinalTranscript(nextText);
      return;
    }

    try {
      await onManualFallbackSubmit(nextText);
      setInterimTranscript('');
      setFinalTranscript(nextText);
    } catch (submitError) {
      const nextError = `Unable to submit the manual fallback answer. ${getErrorMessage(submitError)}`;
      setError(nextError);
      throw new Error(nextError);
    }
  };

  return {
    connectionStatus,
    userSpeaking,
    botThinking,
    botSpeaking: transportBotSpeaking || kokoro.isSpeaking,
    interimTranscript,
    finalTranscript,
    assistantTranscript,
    currentStage: resolvedStage,
    currentQuestion: resolvedQuestion,
    transport,
    ...providerMetadata,
    connect,
    disconnect,
    startInterview,
    submitManualAnswer,
    enableAudio: kokoro.init,
    stopSpeaking: kokoro.stop,
    error,
    kokoroSupported: kokoro.isSupported,
    kokoroLoading: kokoro.isLoading,
    kokoroReady: kokoro.isReady,
    kokoroError: kokoro.error,
    micPermissionStatus,
    selectedVoice: kokoro.selectedVoice,
    voices: kokoro.voices,
    setVoice: kokoro.setVoice,
  };
}
