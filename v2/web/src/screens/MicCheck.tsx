import { useEffect, useRef, useState } from 'react';
import { Button, Card, NavBar } from '../components/ui';
import { Recorder } from '../lib/recorder';

type Phase = 'idle' | 'recording' | 'playback';

export function MicCheck({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
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
    <Card>
      <h2 className="text-2xl font-bold tracking-tight">Mic check</h2>
      <p className="mt-1 mb-6 text-ink-secondary">
        Record a few seconds and play it back to make sure you can be heard clearly.
      </p>

      <div className="flex min-h-14 flex-wrap items-center gap-3">
        {phase === 'idle' && (
          <Button variant="primary" onClick={start}>
            Record a test clip
          </Button>
        )}
        {phase === 'recording' && (
          <>
            <span className="recording-dot" aria-hidden />
            <span className="text-sm">Say something like &quot;testing, one two three&quot;…</span>
            <Button onClick={stop}>Stop</Button>
          </>
        )}
        {phase === 'playback' && clipUrl && (
          <>
            <audio controls src={clipUrl} />
            <Button onClick={start}>Try again</Button>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <NavBar onBack={onBack}>
        {phase !== 'playback' && (
          <Button variant="ghost" onClick={onContinue}>
            Skip mic check
          </Button>
        )}
        <Button variant="primary" onClick={onContinue} disabled={phase === 'recording'}>
          {phase === 'playback' ? 'Sounds good — continue →' : 'Continue →'}
        </Button>
      </NavBar>
    </Card>
  );
}
