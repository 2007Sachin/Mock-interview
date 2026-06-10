import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceAgentStatus = 'idle' | 'speaking' | 'listening' | 'processing';

type VoiceAgentArgs = {
  question: string;
  onSubmit: (transcript: string) => Promise<void>;
};

type RecognitionAlternative = { transcript: string };
type RecognitionResult = ArrayLike<RecognitionAlternative> & { isFinal?: boolean };

type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserRecognition;
    webkitSpeechRecognition?: new () => BrowserRecognition;
  }
}

function getRecognitionConstructor() {
  if (typeof window === 'undefined') return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/** Lightweight latency instrumentation. See README "Voice latency timings". */
function logTiming(stage: string, startedAt: number) {
  console.info(`[voice-timing] ${stage}: ${Math.round(performance.now() - startedAt)}ms`);
}

/**
 * Browser-native voice loop: speaks the current question with speechSynthesis,
 * then listens with SpeechRecognition until the student submits the answer.
 * Advancing is always student-triggered (submitAnswer), never silence-triggered.
 */
export function useVoiceAgent({ question, onSubmit }: VoiceAgentArgs) {
  const [status, setStatus] = useState<VoiceAgentStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');

  const recognitionRef = useRef<BrowserRecognition | null>(null);
  // Whether recognition should be running (survives the browser's automatic
  // stop after silence, which previously left the UI stuck with no transcript).
  const shouldListenRef = useRef(false);
  const statusRef = useRef<VoiceAgentStatus>('idle');
  const isMutedRef = useRef(false);
  const transcriptRef = useRef('');
  const sttStartRef = useRef(0);
  const gotFirstResultRef = useRef(false);
  // Transcript captured by earlier recognition runs (the engine restarts after
  // silence, and each run reports its results cumulatively from scratch).
  const runBaseRef = useRef('');

  statusRef.current = status;
  isMutedRef.current = isMuted;
  transcriptRef.current = transcript;

  const stopRecognition = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  const startRecognition = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition || isMutedRef.current) return;
    if (recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    sttStartRef.current = performance.now();
    gotFirstResultRef.current = false;

    recognition.onresult = (event) => {
      if (!gotFirstResultRef.current) {
        gotFirstResultRef.current = true;
        logTiming('stt:listen→first-result', sttStartRef.current);
      }

      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalText += `${text} `;
        } else {
          interimText += text;
        }
      }

      const trimmedFinal = finalText.trim();
      if (trimmedFinal) {
        logTiming('stt:listen→final-segment', sttStartRef.current);
        setTranscript(`${runBaseRef.current} ${trimmedFinal}`.trim());
      }
      setInterimTranscript(interimText.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return; // onend handles restart
      }
      shouldListenRef.current = false;
      recognitionRef.current = null;
      setStatus('idle');
      setError(
        event.error === 'not-allowed'
          ? 'Microphone access was denied. Allow it in browser settings, then unmute.'
          : `Speech recognition failed (${event.error}). You can type your answer instead.`,
      );
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setInterimTranscript('');
      // The browser engine stops itself after silence; restart so the mic
      // stays live until the student presses "Next question" or mutes.
      if (shouldListenRef.current && !isMutedRef.current && statusRef.current === 'listening') {
        startRecognition();
      }
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    runBaseRef.current = transcriptRef.current;
    try {
      recognition.start();
      setStatus('listening');
      setError('');
    } catch {
      recognitionRef.current = null;
    }
  }, []);

  const speakQuestion = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const text = question.trim();
    if (!text) return;

    // Pause the mic while the AI talks so it doesn't transcribe itself.
    stopRecognition();
    window.speechSynthesis.cancel();

    const queuedAt = performance.now();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {
      logTiming('tts:queue→first-audio', queuedAt);
      setStatus('speaking');
    };
    const beginListening = () => {
      if (statusRef.current === 'processing') return;
      setStatus('idle');
      if (!isMutedRef.current) startRecognition();
    };
    utterance.onend = beginListening;
    utterance.onerror = beginListening;
    window.speechSynthesis.speak(utterance);
  }, [question, startRecognition, stopRecognition]);

  // New question: reset the answer and speak it.
  useEffect(() => {
    setTranscript('');
    setInterimTranscript('');
    if (question.trim()) {
      speakQuestion();
    }
    // speakQuestion identity changes with `question` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((muted) => {
      const next = !muted;
      isMutedRef.current = next;
      if (next) {
        stopRecognition();
        if (statusRef.current === 'listening') setStatus('idle');
      } else if (statusRef.current !== 'speaking' && statusRef.current !== 'processing') {
        startRecognition();
      }
      return next;
    });
  }, [startRecognition, stopRecognition]);

  const submitAnswer = useCallback(async () => {
    const answer = `${transcriptRef.current} ${interimTranscript}`.trim() || transcriptRef.current.trim();
    if (!answer || statusRef.current === 'processing') return;

    stopRecognition();
    window.speechSynthesis?.cancel();
    setInterimTranscript('');
    setStatus('processing');
    setError('');

    const submittedAt = performance.now();
    try {
      await onSubmit(answer);
      logTiming('answer:submit→next-question-ack', submittedAt);
      // The parent advances `question`, which re-triggers speak + reset.
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit your answer. Please try again.');
      if (!isMutedRef.current) startRecognition();
      return;
    }
    setStatus('idle');
  }, [interimTranscript, onSubmit, startRecognition, stopRecognition]);

  return {
    status,
    isSpeaking: status === 'speaking',
    isListening: status === 'listening',
    isProcessing: status === 'processing',
    transcript,
    interimTranscript,
    setTranscript,
    isMuted,
    toggleMute,
    speakQuestion,
    submitAnswer,
    error,
    speechRecognitionSupported: Boolean(getRecognitionConstructor()),
  };
}
