import { useRef, useState } from 'react';
import { usePipecatInterview } from '@/hooks/usePipecatInterview';

function Indicator({ active, label, tone }: { active: boolean; label: string; tone: 'emerald' | 'amber' | 'sky' }) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
      : tone === 'amber'
        ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
        : 'border-sky-300/30 bg-sky-300/10 text-sky-100';

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}>
      {label}: {active ? 'Yes' : 'No'}
    </span>
  );
}

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
  const [manualAnswer, setManualAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitSequenceRef = useRef(0);
  const voice = usePipecatInterview({
    sessionId,
    currentStage,
    currentQuestion,
    onManualFallbackSubmit,
  });

  const handleManualSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const submittedAnswer = manualAnswer;
    const submitId = submitSequenceRef.current + 1;
    submitSequenceRef.current = submitId;
    setIsSubmitting(true);

    try {
      await voice.submitManualAnswer(submittedAnswer);
      setManualAnswer((current) => (current === submittedAnswer ? '' : current));
    } finally {
      if (submitSequenceRef.current === submitId) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="space-y-5 rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <p className="rounded-2xl border border-sky-300/30 bg-sky-300/10 px-4 py-3 text-sm text-sky-100">
        Pipecat mode is enabled for session <span className="font-medium text-white">{sessionId}</span>. Live voice
        connects through the upcoming frontend-only Daily transport flow, while manual answer persistence still uses the
        existing fallback submit path.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            void voice.enableAudio();
          }}
          disabled={!voice.kokoroSupported || voice.kokoroLoading || voice.kokoroReady}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {voice.kokoroReady ? 'Audio Enabled' : voice.kokoroLoading ? 'Enabling Audio...' : 'Enable Audio'}
        </button>
        <button
          type="button"
          onClick={() => {
            void voice.connect();
          }}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={() => {
            void voice.startInterview();
          }}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white"
        >
          Start Interview
        </button>
        <button
          type="button"
          onClick={() => {
            void voice.stopSpeaking();
          }}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white"
        >
          Stop Speaking
        </button>
        <button
          type="button"
          onClick={() => {
            void voice.disconnect();
          }}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white"
        >
          Disconnect
        </button>
      </div>

      <div className="grid gap-4 text-sm text-slate-300 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Kokoro</p>
          <p className="mt-2 text-white">
            {voice.kokoroError
              ? `Error: ${voice.kokoroError}`
              : voice.kokoroReady
                ? 'Ready'
                : voice.kokoroLoading
                  ? 'Loading'
                  : voice.kokoroSupported
                    ? 'Idle'
                    : 'Unsupported in this browser'}
          </p>
          <label className="mt-4 block text-xs uppercase tracking-[0.3em] text-slate-400">
            Voice
            <select
              value={voice.selectedVoice}
              onChange={(event) => voice.setVoice(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none"
            >
              {voice.voices.length > 0 ? (
                voice.voices.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.id})
                  </option>
                ))
              ) : (
                <option value={voice.selectedVoice}>{voice.selectedVoice}</option>
              )}
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Connection</p>
          <p className="mt-2 text-white">{voice.connectionStatus}</p>
          <p className="mt-3 text-sm text-slate-300">
            <span className="text-slate-400">Mic permission:</span> {voice.micPermissionStatus}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Indicator active={voice.userSpeaking} label="User speaking" tone="emerald" />
            <Indicator active={voice.botThinking} label="Bot thinking" tone="amber" />
            <Indicator active={voice.botSpeaking} label="Bot speaking" tone="sky" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Current Stage</p>
          <p className="mt-2 text-white">{voice.currentStage || 'Waiting for stage...'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Current Question</p>
          <p className="mt-2 text-white">{voice.currentQuestion || 'Waiting for question...'}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Assistant Transcript</p>
          <p className="mt-2 whitespace-pre-wrap text-white">{voice.assistantTranscript || 'No assistant transcript yet.'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Interim Transcript</p>
          <p className="mt-2 whitespace-pre-wrap text-white">{voice.interimTranscript || 'No interim transcript yet.'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Final Transcript</p>
          <p className="mt-2 whitespace-pre-wrap text-white">{voice.finalTranscript || 'No final transcript yet.'}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Provider Metadata</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <p>
            <span className="text-slate-400">STT:</span> {voice.sttProvider} / {voice.sttModel}
          </p>
          <p>
            <span className="text-slate-400">LLM:</span> {voice.llmProvider} / {voice.llmModel}
          </p>
          <p>
            <span className="text-slate-400">TTS:</span> {voice.ttsProvider} / {voice.ttsModel}
          </p>
        </div>
      </div>

      {voice.error ? (
        <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {voice.error}
        </p>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <p className="text-sm font-semibold text-white">Manual fallback answer</p>
        <textarea
          value={manualAnswer}
          onChange={(event) => setManualAnswer(event.target.value)}
          rows={8}
          className="w-full rounded-[2rem] border border-white/10 bg-slate-950 px-4 py-4 text-sm text-slate-100 outline-none"
          placeholder="Use this fallback path when realtime capture is unavailable."
        />
        <button
          type="button"
          onClick={() => {
            void handleManualSubmit();
          }}
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Manual Answer'}
        </button>
      </div>
    </div>
  );
}
