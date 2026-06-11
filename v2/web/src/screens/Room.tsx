import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Orb, type OrbState } from '../components/Orb';
import { endSession, skipQuestion, submitAnswer } from '../lib/api';
import { Recorder } from '../lib/recorder';
import { speak, stopSpeaking } from '../lib/tts';
import type { Session } from '../lib/types';

type TurnState = 'speaking' | 'ready' | 'recording' | 'processing';

export function Room({ session, onFinished }: { session: Session; onFinished: () => void }) {
  const total = session.brief.questionBank.length;
  const [questionIndex, setQuestionIndex] = useState(session.currentQuestion);
  const [question, setQuestion] = useState(session.brief.questionBank[session.currentQuestion] ?? '');
  const [state, setState] = useState<TurnState>('speaking');
  const [typing, setTyping] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingClip, setPendingClip] = useState<Blob | null>(null);
  const [speakNonce, setSpeakNonce] = useState(0); // bump to re-speak the current question
  const recorder = useRef(new Recorder());

  // Speak each question as it appears; the text stays on screen regardless.
  useEffect(() => {
    if (state !== 'speaking' || !question) return;
    let cancelled = false;
    void speak(question).then(() => {
      if (!cancelled) setState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [state, question, speakNonce]);

  const orbState: OrbState =
    state === 'speaking' ? 'speaking' : state === 'recording' ? 'listening' : state === 'processing' ? 'thinking' : 'idle';

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
    setState('speaking');
  }

  async function startRecording() {
    setError(null);
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
      setState('ready');
    }
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
      setState('ready');
    }
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    if (!typedAnswer.trim()) return;
    setError(null);
    setState('processing');
    void upload(typedAnswer.trim());
  }

  function repeat() {
    setError(null);
    setSpeakNonce((n) => n + 1);
    setState('speaking');
  }

  async function skip() {
    setError(null);
    setState('processing');
    try {
      showNext(await skipQuestion(session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not skip.');
      setState('ready');
    }
  }

  async function endNow() {
    stopSpeaking();
    recorder.current.cancel();
    await endSession(session.id).catch(() => undefined);
    onFinished();
  }

  return (
    <div className="card">
      <div className="room-header">
        <span className="muted">{session.brief.title}</span>
        <span className="muted">
          Question {Math.min(questionIndex + 1, total)} of {total}
        </span>
      </div>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={questionIndex}>
        <div className="progress-fill" style={{ width: `${(questionIndex / total) * 100}%` }} />
      </div>

      <div className="room-stage">
        <Orb state={orbState} />
        <p className="question-text">{question}</p>
      </div>

      <div className="room-controls">
        {state === 'speaking' && <span className="status-line">Interviewer is asking the question…</span>}
        {state === 'ready' && !typing && !pendingClip && (
          <button className="btn btn-primary btn-big" onClick={startRecording}>
            Answer
          </button>
        )}
        {state === 'ready' && pendingClip && (
          <button
            className="btn btn-primary btn-big"
            onClick={() => {
              setError(null);
              setState('processing');
              void upload(pendingClip);
            }}
          >
            Retry upload
          </button>
        )}
        {state === 'recording' && (
          <>
            <span className="recording-dot" aria-hidden />
            <span>Recording… speak your answer</span>
            <button className="btn btn-secondary btn-big" onClick={finishRecording}>
              Done
            </button>
          </>
        )}
        {state === 'processing' && <span className="status-line">Thinking…</span>}
      </div>

      {state === 'ready' && typing && (
        <form className="typed-answer" onSubmit={submitTyped}>
          <textarea
            value={typedAnswer}
            onChange={(e) => setTypedAnswer(e.target.value)}
            rows={4}
            placeholder="Type your answer here…"
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={!typedAnswer.trim()}>
            Submit answer
          </button>
        </form>
      )}

      {state === 'ready' && (
        <div className="room-secondary">
          <button className="btn btn-secondary" onClick={repeat}>
            Repeat question
          </button>
          <button className="btn btn-secondary" onClick={() => setTyping((t) => !t)}>
            {typing ? 'Speak instead' : 'Type instead'}
          </button>
          <button className="btn btn-secondary" onClick={skip}>
            Skip
          </button>
          <button className="btn btn-danger" onClick={endNow}>
            End interview
          </button>
        </div>
      )}

      {lastTranscript && state !== 'processing' && (
        <div className="transcript-box">
          <strong>Your previous answer (transcript)</strong>
          {lastTranscript}
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
