import { useEffect, useRef, useState } from 'react';
import { Recorder } from '../lib/recorder';

type Phase = 'idle' | 'recording' | 'playback';

export function MicCheck({ onContinue }: { onContinue: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef(new Recorder());

  useEffect(() => {
    return () => {
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
  }, [clipUrl]);

  async function start() {
    setError(null);
    try {
      await recorder.current.start();
      setPhase('recording');
    } catch {
      setError('Microphone access was denied. Allow the mic in your browser settings, then try again.');
    }
  }

  async function stop() {
    const clip = await recorder.current.stop();
    setClipUrl(URL.createObjectURL(clip));
    setPhase('playback');
  }

  return (
    <div className="card">
      <h2>Mic check</h2>
      <p className="subtle">
        Record a few seconds and play it back to make sure you can be heard clearly.
      </p>

      <div className="room-controls">
        {phase === 'idle' && (
          <button className="btn btn-primary" onClick={start}>
            Record a test clip
          </button>
        )}
        {phase === 'recording' && (
          <>
            <span className="recording-dot" aria-hidden />
            <span>Say something like &quot;testing, one two three&quot;…</span>
            <button className="btn btn-secondary" onClick={stop}>
              Stop
            </button>
          </>
        )}
        {phase === 'playback' && clipUrl && (
          <>
            <audio controls src={clipUrl} />
            <button className="btn btn-secondary" onClick={start}>
              Try again
            </button>
            <button className="btn btn-primary" onClick={onContinue}>
              Sounds good — continue
            </button>
          </>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
