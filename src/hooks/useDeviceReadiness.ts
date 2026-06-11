import { useCallback, useEffect, useRef, useState } from 'react';

export type DeviceReadinessState =
  | 'idle'
  | 'requesting_permissions'
  | 'mic_ready'
  | 'camera_ready'
  | 'speaker_test_pending'
  | 'speaker_test_passed'
  | 'voice_service_checking'
  | 'ready'
  | 'failed';

export interface BrowserSupport {
  mediaDevices: boolean;
  getUserMedia: boolean;
  audioContext: boolean;
  speechSynthesis: boolean;
  speechRecognition: boolean;
}

export interface DeviceReadiness {
  state: DeviceReadinessState;
  micAllowed: boolean;
  cameraAllowed: boolean;
  cameraStream: MediaStream | null;
  micLevel: number;
  speakerTestPassed: boolean;
  browserSupport: BrowserSupport;
  errors: Record<string, string>;
  requestPermissions: () => Promise<void>;
  runSpeakerTest: () => Promise<void>;
  markReady: () => void;
}

function checkBrowserSupport(): BrowserSupport {
  return {
    mediaDevices: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices),
    getUserMedia:
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    audioContext: typeof AudioContext !== 'undefined' || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined',
    speechSynthesis: typeof window !== 'undefined' && Boolean(window.speechSynthesis),
    speechRecognition:
      typeof window !== 'undefined' &&
      Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition),
  };
}

export function useDeviceReadiness(): DeviceReadiness {
  const [state, setState] = useState<DeviceReadinessState>('idle');
  const [micAllowed, setMicAllowed] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [speakerTestPassed, setSpeakerTestPassed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const browserSupport = checkBrowserSupport();

  const stopMicAnalysis = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const startMicAnalysis = useCallback((stream: MediaStream) => {
    if (!browserSupport.audioContext) return;

    const AudioCtx =
      AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = ctx;

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const sum = data.reduce((a, b) => a + b, 0);
      const avg = sum / data.length;
      setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [browserSupport.audioContext]);

  const requestPermissions = useCallback(async () => {
    if (!browserSupport.getUserMedia) {
      setErrors((prev) => ({ ...prev, permissions: 'Your browser does not support microphone access.' }));
      setState('failed');
      return;
    }

    setState('requesting_permissions');
    setErrors({});

    let micStream: MediaStream | null = null;
    let camStream: MediaStream | null = null;

    // Request mic first
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = micStream;
      setMicAllowed(true);
      setState('mic_ready');
      startMicAnalysis(micStream);
    } catch {
      setErrors((prev) => ({
        ...prev,
        mic: 'Microphone access was denied. Please allow microphone access in your browser settings and retry.',
      }));
      setState('failed');
      return;
    }

    // Request camera
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      setCameraStream(camStream);
      setCameraAllowed(true);
      setState('camera_ready');
    } catch {
      setErrors((prev) => ({
        ...prev,
        camera: 'Camera access was denied. You can skip camera or allow it in browser settings.',
      }));
      // Camera denied is not fatal — stay at mic_ready, mark camera optional fail
      setState('mic_ready');
    }

    // After both attempts, move to speaker test
    setState('speaker_test_pending');
  }, [browserSupport.getUserMedia, startMicAnalysis]);

  const runSpeakerTest = useCallback(async () => {
    if (!browserSupport.audioContext) {
      // Fallback: try browser speechSynthesis
      if (browserSupport.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance('Speaker test. Can you hear this?');
        window.speechSynthesis.speak(utterance);
        setSpeakerTestPassed(true);
        setState('speaker_test_passed');
        return;
      }
      setErrors((prev) => ({ ...prev, speaker: 'Speaker test unavailable in this browser.' }));
      setSpeakerTestPassed(true);
      setState('speaker_test_passed');
      return;
    }

    const AudioCtx =
      AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    // Use existing context or create a short-lived one for the tone
    const ctx = audioContextRef.current ?? new AudioCtx();

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.6);

    await new Promise<void>((resolve) => setTimeout(resolve, 700));
    setSpeakerTestPassed(true);
    setState('speaker_test_passed');
  }, [browserSupport.audioContext, browserSupport.speechSynthesis]);

  const markReady = useCallback(() => {
    setState('ready');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicAnalysis();

      if (micStreamRef.current) {
        for (const track of micStreamRef.current.getTracks()) track.stop();
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, [stopMicAnalysis]);

  return {
    state,
    micAllowed,
    cameraAllowed,
    cameraStream,
    micLevel,
    speakerTestPassed,
    browserSupport,
    errors,
    requestPermissions,
    runSpeakerTest,
    markReady,
  };
}
