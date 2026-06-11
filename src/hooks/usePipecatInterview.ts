import { useEffect, useRef, useState } from 'react';
import type { BotOutputData, MediaState, PipecatClient, TranscriptData } from '@pipecat-ai/client-js';
import { useKokoroTts } from '@/hooks/useKokoroTts';
import { env } from '@/lib/env';
import { ApiRequestError, connectInterviewVoice } from '@/lib/mockInterviewApi';
import { formatSessionStorageKey } from '@/lib/signature';
import { logTiming } from '@/lib/voiceTiming';
import type {
  InterviewProviderMetadata,
  PipecatBrowserEvent,
  PipecatConnectionStatus,
  PipecatTransportType,
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
  onSubmitAnswer: (transcript: string) => Promise<void>;
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
  onSubmitAnswer,
}: UsePipecatInterviewOptions) {
  const kokoro = useKokoroTts();
  const clientRef = useRef<PipecatClient | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const lastSpokenAssistantTextRef = useRef('');
  const thinkingStartedAtRef = useRef(0);
  const answerSubmittedAtRef = useRef(0);
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
  const [isMuted, setIsMuted] = useState(false);
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

  // When the room advances the question outside of the websocket event flow
  // (manual fallback / REST question loop), keep the panel and TTS in sync so
  // the interview doesn't silently stall on the previous question.
  useEffect(() => {
    setResolvedQuestion(currentQuestion);
    const websocketDrivesQuestions = websocketRef.current?.readyState === WebSocket.OPEN;
    if (connectionStatus === 'connected' && !websocketDrivesQuestions && currentQuestion.trim()) {
      setAssistantTranscript(currentQuestion);
      speakAssistantText(currentQuestion);
    }
    // speakAssistantText is stable in practice (refs only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, connectionStatus]);

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
        if (answerSubmittedAtRef.current) {
          logTiming('answer:submit→assistant-text', answerSubmittedAtRef.current);
          answerSubmittedAtRef.current = 0;
        }
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
        if (event.isThinking) {
          thinkingStartedAtRef.current = performance.now();
        } else if (thinkingStartedAtRef.current) {
          logTiming('llm:thinking', thinkingStartedAtRef.current);
          thinkingStartedAtRef.current = 0;
        }
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

  // The Pipecat client SDK and Daily transport are only needed for the Daily
  // path, so they are loaded on demand to keep them out of the initial bundle.
  const ensureClient = async () => {
    if (clientRef.current) {
      return clientRef.current;
    }

    const [{ PipecatClient: PipecatClientCtor }, { DailyTransport }] = await Promise.all([
      import('@pipecat-ai/client-js'),
      import('@pipecat-ai/daily-transport'),
    ]);

    const client = new PipecatClientCtor({
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

  const connectWebsocketTransport = async (voiceConnect: { pipecatConnectUrl: string; voiceToken: string }) => {
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
    const connectStartedAt = performance.now();

    try {
      const voiceConnect = await connectInterviewVoice(sessionId, sessionToken);
      setTransport(voiceConnect.transport);
      setResolvedStage(voiceConnect.currentStage ?? currentStage);
      setResolvedQuestion(voiceConnect.currentQuestion ?? currentQuestion);
      if (voiceConnect.transport === 'daily') {
        if (voiceConnect.setupError) {
          throw new Error(voiceConnect.setupError);
        }
        if (!voiceConnect.connectParams) {
          throw new Error('Daily transport is configured, but the connect payload is unavailable.');
        }

        const client = await ensureClient();
        await client.initDevices();
        setMicPermissionStatus(getMicPermissionStatus(client.mediaState));
        await client.connect(
          voiceConnect.connectParams as NonNullable<Parameters<PipecatClient['connect']>[0]>,
        );
        logTiming('voice:connect', connectStartedAt);
        return;
      }

      await connectWebsocketTransport(voiceConnect);
      logTiming('voice:connect', connectStartedAt);
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
      await kokoro.init();
    }

    setAssistantTranscript(resolvedQuestion);
    speakAssistantText(resolvedQuestion, true);
  };

  const submitAnswer = async (text: string) => {
    const nextText = text.trim();
    if (!nextText) {
      setError('No answer recorded yet. Speak or type your answer first.');
      return;
    }

    setError('');
    answerSubmittedAtRef.current = performance.now();

    if (transport === 'websocket' && websocketRef.current?.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'user_final_transcript',
        text: nextText,
        stage: resolvedStage,
        question: resolvedQuestion,
        createdAt: new Date().toISOString(),
      }));
    }

    try {
      await onSubmitAnswer(nextText);
    } catch (submitError) {
      setError(`Unable to record answer. ${getErrorMessage(submitError)}`);
      return;
    }

    setInterimTranscript('');
    setFinalTranscript('');
  };

  const repeatQuestion = () => {
    if (resolvedQuestion) {
      speakAssistantText(resolvedQuestion, true);
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (clientRef.current) {
      void clientRef.current.enableMic(!next);
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
    isMuted,
    ...providerMetadata,
    connect,
    disconnect,
    startInterview,
    submitAnswer,
    repeatQuestion,
    toggleMute,
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
