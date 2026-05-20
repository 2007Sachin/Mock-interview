import { useRef, useState } from 'react';
import { usePipecatInterview } from '@/hooks/usePipecatInterview';

function PulseDot({ active, color }: { active: boolean; color: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full transition-all duration-300 ${
        active ? `${color} animate-pulse scale-110` : 'bg-white/20 scale-100'
      }`}
    />
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
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const submitSequenceRef = useRef(0);

  const voice = usePipecatInterview({
    sessionId,
    currentStage,
    currentQuestion,
    onManualFallbackSubmit,
  });

  const handleManualSubmit = async () => {
    if (isSubmitting) return;

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

  const isConnected = voice.connectionStatus === 'connected';

  return (
    <div className="space-y-4 rounded-[2rem] border border-white/10 bg-white/5 p-6">
      {/* Connection status bar */}
      {!isConnected && (
        <div className="flex items-center justify-between rounded-2xl border border-sky-300/30 bg-sky-300/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-sky-100">
            <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
            <span>{voice.connectionStatus}</span>
          </div>
          <button
            type="button"
            onClick={() => { void voice.connect(); }}
            className="rounded-2xl border border-sky-300/40 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-300/10"
          >
            Connect
          </button>
        </div>
      )}

      {/* Voice status indicators */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <PulseDot active={voice.botSpeaking} color="bg-sky-400" />
          <span className="text-xs text-slate-400">
            {voice.botSpeaking ? 'Assistant speaking' : 'Assistant idle'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <PulseDot active={voice.userSpeaking} color="bg-emerald-400" />
          <span className="text-xs text-slate-400">
            {voice.userSpeaking ? 'You speaking' : 'Mic open'}
          </span>
        </div>
        {voice.botThinking && (
          <div className="flex items-center gap-1.5">
            <PulseDot active color="bg-amber-400" />
            <span className="text-xs text-amber-300">Processing…</span>
          </div>
        )}
      </div>

      {/* Assistant bubble */}
      <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-5 space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Assistant</p>
        <p className="text-white text-sm leading-relaxed">
          {voice.assistantTranscript || currentQuestion || 'Waiting for assistant…'}
        </p>
        {!isConnected && (
          <button
            type="button"
            onClick={() => { void voice.startInterview(); }}
            className="mt-2 rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950"
          >
            Start Interview
          </button>
        )}
        {isConnected && voice.botSpeaking && (
          <button
            type="button"
            onClick={() => { void voice.stopSpeaking(); }}
            className="text-xs text-sky-300 underline underline-offset-2"
          >
            Stop speaking
          </button>
        )}
      </div>

      {/* Live transcript */}
      {(voice.interimTranscript || voice.finalTranscript) && (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <PulseDot active={voice.userSpeaking} color="bg-emerald-400" />
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
              {voice.userSpeaking ? 'You speaking…' : 'Your answer'}
            </p>
          </div>
          {voice.interimTranscript && (
            <p className="text-slate-300 text-sm italic">{voice.interimTranscript}</p>
          )}
          {voice.finalTranscript && (
            <p className="text-white text-sm leading-relaxed">{voice.finalTranscript}</p>
          )}
        </div>
      )}

      {/* Mic permission warning */}
      {voice.micPermissionStatus === 'denied' && (
        <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          Microphone access was denied. Please enable it in browser settings and reconnect.
        </p>
      )}

      {voice.error && (
        <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {voice.error}
        </p>
      )}

      {/* Text fallback drawer */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/40">
        <button
          type="button"
          onClick={() => setFallbackOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-sm text-slate-400 hover:text-white"
        >
          <span>Having trouble? Use text fallback</span>
          <svg
            className={`h-4 w-4 transition-transform ${fallbackOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {fallbackOpen && (
          <div className="border-t border-white/10 p-4 space-y-3">
            <textarea
              value={manualAnswer}
              onChange={(event) => setManualAnswer(event.target.value)}
              rows={6}
              className="w-full rounded-[2rem] border border-white/10 bg-slate-950 px-4 py-4 text-sm text-slate-100 outline-none resize-none"
              placeholder="Use this when voice capture is unavailable."
            />
            <button
              type="button"
              onClick={() => { void handleManualSubmit(); }}
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
            >
              {isSubmitting ? 'Submitting…' : 'Submit Answer'}
            </button>
          </div>
        )}
      </div>

      {/* Debug / technical details drawer */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/40">
        <button
          type="button"
          onClick={() => setDebugOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-xs text-slate-500 hover:text-slate-300"
        >
          <span>Technical details</span>
          <svg
            className={`h-3.5 w-3.5 transition-transform ${debugOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {debugOpen && (
          <div className="border-t border-white/10 p-4 space-y-4 text-xs text-slate-400">
            <div className="grid gap-2 md:grid-cols-3">
              <p><span className="text-slate-500">STT:</span> {voice.sttProvider} / {voice.sttModel}</p>
              <p><span className="text-slate-500">LLM:</span> {voice.llmProvider} / {voice.llmModel}</p>
              <p><span className="text-slate-500">TTS:</span> {voice.ttsProvider} / {voice.ttsModel}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <p><span className="text-slate-500">Transport:</span> {voice.transport}</p>
              <p><span className="text-slate-500">Connection:</span> {voice.connectionStatus}</p>
              <p><span className="text-slate-500">Mic:</span> {voice.micPermissionStatus}</p>
              <p><span className="text-slate-500">Session:</span> {sessionId}</p>
            </div>

            <div className="rounded-xl border border-white/10 p-3 space-y-1">
              <p className="text-slate-500 uppercase tracking-wider">Kokoro</p>
              <p className="text-white">
                {voice.kokoroError
                  ? `Error: ${voice.kokoroError}`
                  : voice.kokoroReady
                    ? 'Ready'
                    : voice.kokoroLoading
                      ? 'Loading…'
                      : voice.kokoroSupported
                        ? 'Idle'
                        : 'Not supported in this browser'}
              </p>
              {!voice.kokoroReady && (
                <button
                  type="button"
                  onClick={() => { void voice.enableAudio(); }}
                  disabled={!voice.kokoroSupported || voice.kokoroLoading || voice.kokoroReady}
                  className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  {voice.kokoroLoading ? 'Loading…' : 'Enable Audio'}
                </button>
              )}
              {voice.voices.length > 0 && (
                <select
                  value={voice.selectedVoice}
                  onChange={(event) => voice.setVoice(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none mt-1"
                >
                  {voice.voices.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { void voice.disconnect(); }}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
