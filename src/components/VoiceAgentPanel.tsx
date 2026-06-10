import { useState } from 'react';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';
import {
  ErrorNotice,
  PresenceRow,
  QuestionCard,
  TranscriptCard,
  buttonStyles,
  type StatusVariant,
} from '@/components/VoiceCallUI';

export function VoiceAgentPanel({
  question,
  onSubmit,
  onEndInterview,
  isEndingInterview,
}: {
  question: string;
  onSubmit: (transcript: string) => Promise<void>;
  onEndInterview: () => Promise<void>;
  isEndingInterview: boolean;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [manualAnswer, setManualAnswer] = useState('');
  const [typedError, setTypedError] = useState('');
  const [isSubmittingTyped, setIsSubmittingTyped] = useState(false);

  const voice = useVoiceAgent({ question, onSubmit });
  const isBusy = voice.isProcessing || isSubmittingTyped;

  const statusLabel = voice.isSpeaking
    ? 'AI speaking'
    : voice.isProcessing
      ? 'Processing…'
      : voice.isListening
        ? 'Listening'
        : voice.isMuted
          ? 'Mic muted'
          : 'Ready';

  const statusVariant: StatusVariant = voice.isSpeaking
    ? 'info'
    : voice.isProcessing
      ? 'warning'
      : voice.isListening
        ? 'accent'
        : voice.isMuted
          ? 'danger'
          : 'neutral';

  const hasAnswer = Boolean(voice.transcript.trim() || voice.interimTranscript.trim());

  const handleSubmitTyped = async () => {
    const text = manualAnswer.trim();
    if (!text || isBusy) return;
    setTypedError('');
    setIsSubmittingTyped(true);
    try {
      await onSubmit(text);
      setManualAnswer('');
    } catch (error) {
      setTypedError(error instanceof Error ? error.message : 'Unable to submit your answer. Please try again.');
    } finally {
      setIsSubmittingTyped(false);
    }
  };

  return (
    <div className="space-y-4">
      <PresenceRow
        botSpeaking={voice.isSpeaking}
        botThinking={voice.isProcessing}
        userSpeaking={voice.isListening && Boolean(voice.interimTranscript)}
        isMuted={voice.isMuted}
        statusLabel={statusLabel}
        statusVariant={statusVariant}
      />

      <QuestionCard text={question} />

      <TranscriptCard
        interimText={voice.interimTranscript}
        finalText={voice.transcript}
        userSpeaking={voice.isListening && Boolean(voice.interimTranscript)}
      />

      {/* Primary controls — always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={voice.speakQuestion}
          disabled={voice.isSpeaking || voice.isProcessing}
          className={buttonStyles.secondary}
          aria-label="Repeat the current question"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
          Repeat
        </button>

        <button
          type="button"
          onClick={voice.toggleMute}
          className={voice.isMuted ? buttonStyles.mutedActive : buttonStyles.secondary}
          aria-label={voice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={voice.isMuted}
        >
          {voice.isMuted ? 'Unmute' : 'Mute'}
        </button>

        <button
          type="button"
          onClick={() => {
            void voice.submitAnswer();
          }}
          disabled={!hasAnswer || voice.isProcessing}
          className={`flex-1 ${buttonStyles.primary}`}
          aria-label="Finish this answer and move to the next question"
        >
          {voice.isProcessing ? 'Submitting…' : 'Done — Next question →'}
        </button>

        <button
          type="button"
          onClick={() => {
            void onEndInterview();
          }}
          disabled={isEndingInterview}
          className={buttonStyles.danger}
          aria-label="End the interview and generate your report"
        >
          {isEndingInterview ? 'Ending…' : 'End interview'}
        </button>
      </div>

      {!voice.speechRecognitionSupported && (
        <ErrorNotice>
          Speech recognition is unavailable in this browser. Use “Type instead” below to answer.
        </ErrorNotice>
      )}
      {voice.error && <ErrorNotice>{voice.error}</ErrorNotice>}
      {typedError && <ErrorNotice>{typedError}</ErrorNotice>}

      {/* Typed fallback */}
      <div>
        <button
          type="button"
          onClick={() => setTypeOpen((open) => !open)}
          className="flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          aria-expanded={typeOpen}
        >
          <svg
            className={`h-3 w-3 transition-transform ${typeOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {typeOpen ? 'Hide text input' : 'Type instead'}
        </button>

        {typeOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              value={manualAnswer}
              onChange={(event) => setManualAnswer(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-2xl border border-edge/40 bg-canvas px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent/50"
              placeholder="Type your answer here if voice isn't working…"
              aria-label="Typed answer"
            />
            <button
              type="button"
              onClick={() => {
                void handleSubmitTyped();
              }}
              disabled={!manualAnswer.trim() || isBusy}
              className={`w-full ${buttonStyles.primary}`}
            >
              {isSubmittingTyped ? 'Submitting…' : 'Submit typed answer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
