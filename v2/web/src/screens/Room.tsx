import { useEffect, useRef, useState } from 'react';
import { submitAnswer } from '../lib/api';
import { Recorder } from '../lib/recorder';
import { speak } from '../lib/tts';
import type { Session } from '../lib/types';

type TurnState = 'speaking' | 'ready' | 'recording' | 'processing' | 'done';

export function Room({ session }: { session: Session }) {
  const total = session.brief.questionBank.length;
  const [questionIndex, setQuestionIndex] = useState(session.currentQuestion);
  const [question, setQuestion] = useState(session.brief.questionBank[session.currentQuestion] ?? '');
  const [state, setState] = useState<TurnState>('speaking');
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingClip, setPendingClip] = useState<Blob | null>(null);
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
  }, [state, question]);

  async function startRecording() {
    setError(null);
    try {
      await recorder.current.start();
      setState('recording');
    } catch {
      setError('Microphone access was denied. Allow the mic in your browser and try again.');
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

  async function upload(clip: Blob) {
    setPendingClip(null);
    try {
      const result = await submitAnswer(session.id, clip);
      setLastTranscript(result.transcript);
      if (result.done || !result.nextQuestion) {
        setState('done');
      } else {
        setQuestionIndex(result.index);
        setQuestion(result.nextQuestion);
        setState('speaking');
      }
    } catch (err) {
      // Keep the clip so the upload can be retried without re-recording.
      setPendingClip(clip);
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setState('ready');
    }
  }

  if (state === 'done') {
    return (
      <div className="card">
        <h2>Interview complete</h2>
        <p className="subtle">Nice work — you answered all {total} questions.</p>
        {lastTranscript && (
          <div className="transcript-box">
            <strong>Your last answer (transcript)</strong>
            {lastTranscript}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <p className="muted">
        {session.brief.title} — question {questionIndex + 1} of {total}
      </p>
      <p className="question-text">{question}</p>

      <div className="room-controls">
        {state === 'speaking' && <span className="status-line">Interviewer is asking the question…</span>}
        {state === 'ready' && !pendingClip && (
          <button className="btn btn-primary btn-big" onClick={startRecording}>
            Answer
          </button>
        )}
        {state === 'ready' && pendingClip && (
          <button className="btn btn-primary btn-big" onClick={() => { setState('processing'); void upload(pendingClip); }}>
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
        {state === 'processing' && <span className="status-line">Transcribing your answer…</span>}
      </div>

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
