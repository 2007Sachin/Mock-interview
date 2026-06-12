import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Orb, type OrbState } from '../components/Orb';
import { Button, Card } from '../components/ui';
import { endSession, skipQuestion, submitAnswer } from '../lib/api';
import { INTERVIEWER_NAME } from '../lib/interviewer';
import { Recorder } from '../lib/recorder';
import { speak, stopSpeaking } from '../lib/tts';
import type { Session } from '../lib/types';

type TurnState = 'asking' | 'recording' | 'processing';

export function Room({ session, onFinished }: { session: Session; onFinished: () => void }) {
  const total = session.brief.questionBank.length;
  const [questionIndex, setQuestionIndex] = useState(session.currentQuestion);
  const [question, setQuestion] = useState(session.brief.questionBank[session.currentQuestion] ?? '');
  const [state, setState] = useState<TurnState>('asking');
  // Whether the question audio is playing — separate from the turn state so
  // every control stays usable while the interviewer talks.
  const [speaking, setSpeaking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingClip, setPendingClip] = useState<Blob | null>(null);
  const [speakNonce, setSpeakNonce] = useState(0); // bump to re-speak the current question
  const recorder = useRef(new Recorder());

  useEffect(() => {
    if (!question) return;
    let cancelled = false;
    setSpeaking(true);
    void speak(question).then(() => {
      if (!cancelled) setSpeaking(false);
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [question, speakNonce]);

  const orbState: OrbState =
    state === 'recording' ? 'listening' : state === 'processing' ? 'thinking' : speaking ? 'speaking' : 'idle';

  function showNext(result: { done: boolean; nextQuestion: string | null; index: number }) {
    if (result.done || !result.nextQuestion) {
      void endSession(session.id).catch(() => undefined);
      onFinished();
      return;
    }
    setQuestionIndex(result.index);
    setQuestion(result.nextQuestion);
    setTyping(false);
    setTypedAnswer('');
    setState('asking');
  }

  function interruptSpeech() {
    stopSpeaking();
    setSpeaking(false);
  }

  async function startRecording() {
    interruptSpeech();
    setError(null);
    setPendingClip(null);
    try {
      await recorder.current.start();
      setState('recording');
    } catch {
      setError('Microphone access was denied. Allow the mic in your browser, or use "Type instead".');
    }
  }

  async function finishRecording() {
    setState('processing');
    try {
      const clip = await recorder.current.stop();
      await upload(clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording failed. Please try again.');
      setState('asking');
    }
  }

  function cancelRecording() {
    recorder.current.cancel();
    setState('asking');
  }

  async function upload(answer: Blob | string) {
    setPendingClip(null);
    try {
      const result = await submitAnswer(session.id, answer);
      setLastTranscript(result.transcript);
      showNext(result);
    } catch (err) {
      // Keep the clip so the upload can be retried without re-recording.
      if (answer instanceof Blob) setPendingClip(answer);
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setState('asking');
    }
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    if (!typedAnswer.trim()) return;
    interruptSpeech();
    setError(null);
    setState('processing');
    void upload(typedAnswer.trim());
  }

  function repeat() {
    setError(null);
    setSpeakNonce((n) => n + 1);
  }

  async function skip() {
    interruptSpeech();
    setError(null);
    setState('processing');
    try {
      showNext(await skipQuestion(session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not skip.');
      setState('asking');
    }
  }

  async function endNow() {
    interruptSpeech();
    recorder.current.cancel();
    await endSession(session.id).catch(() => undefined);
    onFinished();
  }

  const busy = state === 'processing';

  return (
    <Card>
      {/* Header: where you are in the interview */}
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="truncate text-sm text-ink-muted">{session.brief.title}</span>
        <span className="shrink-0 text-sm font-semibold text-ink-secondary">
          Question {Math.min(questionIndex + 1, total)} of {total}
        </span>
      </div>
      <div
        className="mb-6 h-1.5 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={questionIndex}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(questionIndex / total) * 100}%` }}
        />
      </div>

      {/* Stage: interviewer + question */}
      <div className="mb-6 flex items-center gap-6">
        <div className="shrink-0">
          <Orb state={orbState} />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {state === 'recording'
              ? `${INTERVIEWER_NAME} is listening`
              : state === 'processing'
                ? `${INTERVIEWER_NAME} is thinking`
                : speaking
                  ? `${INTERVIEWER_NAME} is speaking`
                  : `${INTERVIEWER_NAME} is waiting for you`}
          </p>
          <p className="mt-1 text-xl font-semibold">{question}</p>
        </div>
      </div>

      {/* Primary action row */}
      <div className="flex min-h-16 flex-wrap items-center gap-3 rounded-xl bg-surface-muted px-4 py-3">
        {state === 'asking' && !typing && !pendingClip && (
          <Button variant="primary" size="lg" onClick={startRecording}>
            🎙 Answer
          </Button>
        )}
        {state === 'asking' && pendingClip && (
          <>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setError(null);
                setState('processing');
                void upload(pendingClip);
              }}
            >
              Retry upload
            </Button>
            <Button variant="ghost" onClick={startRecording}>
              Re-record instead
            </Button>
          </>
        )}
        {state === 'recording' && (
          <>
            <span className="recording-dot" aria-hidden />
            <span className="text-sm font-medium">Recording… speak your answer</span>
            <Button variant="primary" size="lg" onClick={finishRecording}>
              ✓ Done
            </Button>
            <Button variant="ghost" onClick={cancelRecording}>
              Cancel
            </Button>
          </>
        )}
        {state === 'processing' && (
          <div className="w-full">
            <p className="mb-2 text-sm text-ink-secondary">Transcribing your answer…</p>
            <div className="loading-bar">
              <div />
            </div>
          </div>
        )}
        {state === 'asking' && typing && (
          <form className="w-full" onSubmit={submitTyped}>
            <textarea
              className="mb-2.5 block w-full resize-y rounded-lg border border-edge bg-surface px-3 py-2.5"
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              rows={4}
              placeholder="Type your answer here…"
              autoFocus
            />
            <Button variant="primary" type="submit" disabled={!typedAnswer.trim()}>
              Submit answer
            </Button>
          </form>
        )}
      </div>

      {/* Secondary controls: always visible, consistently placed */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2.5">
          <Button onClick={repeat} disabled={busy || state === 'recording'}>
            ↻ Repeat question
          </Button>
          <Button onClick={() => setTyping((t) => !t)} disabled={busy || state === 'recording'}>
            {typing ? '🎙 Speak instead' : '⌨ Type instead'}
          </Button>
          <Button onClick={skip} disabled={busy || state === 'recording'}>
            Skip →
          </Button>
        </div>
        <Button variant="danger" onClick={endNow} disabled={busy}>
          End interview
        </Button>
      </div>

      {lastTranscript && state !== 'processing' && (
        <div className="mt-5 rounded-lg bg-surface-muted px-4 py-3.5 text-sm">
          <strong className="mb-1 block text-xs tracking-wider text-ink-muted uppercase">
            Your previous answer (transcript)
          </strong>
          {lastTranscript}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}
    </Card>
  );
}
