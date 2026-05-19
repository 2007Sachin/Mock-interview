import { useEffect, useRef, useState } from 'react';

type VoiceAgentArgs = {
  question: string;
  onTranscript?: (transcript: string) => void;
  onSubmit?: (transcript: string) => void;
};

type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserRecognition;
    webkitSpeechRecognition?: new () => BrowserRecognition;
  }
}

export function useVoiceAgent({ question, onTranscript, onSubmit }: VoiceAgentArgs) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<BrowserRecognition | null>(null);

  useEffect(() => {
    setTranscript('');
  }, [question]);

  const speakQuestion = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(question);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setIsListening(false);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const nextTranscript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      setTranscript(nextTranscript);
      onTranscript?.(nextTranscript);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const submitAnswer = () => {
    onSubmit?.(transcript.trim());
  };

  return {
    isSpeaking,
    isListening,
    transcript,
    setTranscript,
    speakQuestion,
    startListening,
    stopListening,
    submitAnswer,
    speechRecognitionSupported: Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition),
  };
}
