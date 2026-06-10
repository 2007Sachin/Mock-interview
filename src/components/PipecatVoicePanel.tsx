import { useState } from 'react';
import { usePipecatInterview } from '@/hooks/usePipecatInterview';
import { InterviewerAvatar, type InterviewerState } from '@/components/InterviewerAvatar';
import {
  ControlBar,
  ErrorNotice,
  QuestionCard,
  TranscriptCard,
  buttonStyles,
} from '@/components/VoiceCallUI';
import { INTERVIEWER_NAME } from '@/lib/interviewer';

export function PipecatVoicePanel({
  sessionId,
  currentStage,
  currentQuestion,
  onSubmitAnswer,
  onEndInterview,
  isEndingInterview,
}: {
  sessionId: string;
  currentStage: string;
  currentQuestion: string;
  onSubmitAnswer: (transcript: string) => Promise<void>;
  onEndInterview: () => Promise<void>;
  isEndingInterview: boolean;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [manualAnswer, setManualAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const voice = usePipecatInterview({
    sessionId,
    currentStage,
    currentQuestion,
    onSubmitAnswer,
  });

  const isConnected = voice.connectionStatus === 'connected';

  const avatarState: InterviewerState = voice.botSpeaking
    ? 'speaking'
    : voice.botThinking || isSubmitting
      ? 'thinking'
      : isConnected
        ? 'listening'
        : 'idle';

  const avatarStatusOverride = !isConnected
    ? voice.connectionStatus === 'idle'
      ? 'Ready to start'
      : 'Connecting…'
    : voice.isMuted && avatarState === 'listening'
      ? 'Mic muted'
      : undefined;

  const hasAnswer = Boolean(voice.finalTranscript.trim());

  const submitAnswer = async (text: string) => {
    if (!text.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await voice.submitAnswer(text.trim());
      setManualAnswer('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Interviewer — the focal point */}
      <div className="flex justify-center pt-2">
        <InterviewerAvatar
          state={avatarState}
          name={INTERVIEWER_NAME}
          activity={Boolean(voice.interimTranscript) || voice.userSpeaking}
          statusOverride={avatarStatusOverride}
        />
      </div>

      <QuestionCard text={voice.assistantTranscript || currentQuestion} />

      <TranscriptCard
        interimText={voice.interimTranscript}
        finalText={voice.finalTranscript}
        userSpeaking={voice.userSpeaking}
      />

      {!isConnected && (
        <button
          type="button"
          onClick={() => {
            void voice.startInterview();
          }}
          disabled={voice.kokoroLoading || !currentQuestion.trim()}
          className={`w-full py-3 ${buttonStyles.primary}`}
        >
          {voice.kokoroLoading
            ? 'Loading audio…'
            : currentQuestion.trim()
              ? 'Connect voice'
              : 'Preparing first question…'}
        </button>
      )}

      {voice.micPermissionStatus === 'denied' && (
        <ErrorNotice>Microphone access was denied. Enable it in browser settings and reconnect.</ErrorNotice>
      )}
      {voice.error && <ErrorNotice>{voice.error}</ErrorNotice>}

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
                void submitAnswer(manualAnswer);
              }}
              disabled={!manualAnswer.trim() || isSubmitting}
              className={`w-full ${buttonStyles.primary}`}
            >
              {isSubmitting ? 'Submitting…' : 'Submit typed answer'}
            </button>
          </div>
        )}
      </div>

      {/* Technical details (debugging aid) */}
      <div>
        <button
          type="button"
          onClick={() => setDebugOpen((open) => !open)}
          className="text-xs text-ink-muted transition-colors hover:text-ink-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          aria-expanded={debugOpen}
        >
          {debugOpen ? '▲ Hide technical details' : '▼ Technical details'}
        </button>

        {debugOpen && (
          <div className="mt-3 space-y-3 rounded-2xl border border-edge/30 bg-surface p-4 text-xs text-ink-secondary">
            <div className="grid gap-2 md:grid-cols-3">
              <p><span className="text-ink-muted">STT:</span> {voice.sttProvider} / {voice.sttModel}</p>
              <p><span className="text-ink-muted">LLM:</span> {voice.llmProvider} / {voice.llmModel}</p>
              <p><span className="text-ink-muted">TTS:</span> {voice.ttsProvider} / {voice.ttsModel}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <p><span className="text-ink-muted">Transport:</span> {voice.transport}</p>
              <p><span className="text-ink-muted">Connection:</span> {voice.connectionStatus}</p>
              <p><span className="text-ink-muted">Mic:</span> {voice.micPermissionStatus}</p>
              <p><span className="text-ink-muted">Session:</span> {sessionId}</p>
            </div>
            <div className="space-y-1 rounded-xl border border-edge/30 p-3">
              <p className="uppercase tracking-wider text-ink-muted">Kokoro</p>
              <p>
                {voice.kokoroError
                  ? `Error: ${voice.kokoroError}`
                  : voice.kokoroReady
                    ? 'Ready'
                    : voice.kokoroLoading
                      ? 'Loading…'
                      : voice.kokoroSupported
                        ? 'Idle'
                        : 'Not supported'}
              </p>
              {voice.voices.length > 0 && (
                <select
                  value={voice.selectedVoice}
                  onChange={(event) => voice.setVoice(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-edge/30 bg-canvas px-3 py-2 text-xs text-ink outline-none"
                  aria-label="Kokoro voice"
                >
                  {voice.voices.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                void voice.disconnect();
              }}
              className={buttonStyles.secondary}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Call toolbar */}
      {isConnected && (
        <ControlBar>
          <button
            type="button"
            onClick={voice.repeatQuestion}
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
              void submitAnswer(voice.finalTranscript);
            }}
            disabled={!hasAnswer || isSubmitting}
            className={`flex-1 ${buttonStyles.primary}`}
            aria-label="Finish this answer and move to the next question"
          >
            {isSubmitting ? 'Submitting…' : 'Done — Next question →'}
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
        </ControlBar>
      )}
    </div>
  );
}
