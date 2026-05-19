import { useState } from 'react';
import { TranscriptPanel } from './TranscriptPanel';

export function PipecatVoicePanel({
  sessionId,
  currentStage,
  currentQuestion,
  onManualFallbackSubmit,
}: {
  sessionId: string;
  currentStage: string;
  currentQuestion: string;
  onManualFallbackSubmit: (transcript: string) => Promise<void>;
}) {
  const [transcript, setTranscript] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async () => {
    const nextTranscript = transcript.trim();
    if (!nextTranscript || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      await onManualFallbackSubmit(nextTranscript);
      setTranscript('');
    } catch (error) {
      console.error('Manual Pipecat fallback submission failed.', error);
      setSubmitError('Unable to submit the fallback response. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <p className="rounded-2xl border border-sky-300/30 bg-sky-300/10 px-4 py-3 text-sm text-sky-100">
        Pipecat mode is enabled for session <span className="font-medium text-white">{sessionId}</span>. Manual
        fallback remains available while the realtime panel is staged.
      </p>

      <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
        <p>Stage: {currentStage}</p>
        <p>Question: {currentQuestion || 'Waiting for prompt...'}</p>
      </div>

      {submitError ? (
        <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {submitError}
        </p>
      ) : null}

      <TranscriptPanel transcript={transcript} onChange={setTranscript} />

      <button
        type="button"
        onClick={() => {
          void handleSubmit();
        }}
        disabled={isSubmitting}
        className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950"
      >
        {isSubmitting ? 'Submitting...' : 'Submit Manual Fallback'}
      </button>
    </div>
  );
}
