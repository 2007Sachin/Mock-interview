import { useRef, useState } from 'react';
import { usePipecatInterview } from '@/hooks/usePipecatInterview';

// ─── Sub-components ──────────────────────────────────────────────────────────

function AiPresence({ speaking, thinking }: { speaking: boolean; thinking: boolean }) {
  const ringColor = speaking ? 'bg-sky-400/25' : thinking ? 'bg-amber-400/25' : 'bg-transparent';
  const borderColor = speaking
    ? 'border-sky-400/70'
    : thinking
    ? 'border-amber-400/70'
    : 'border-white/20';
  const iconColor = speaking ? 'text-sky-300' : thinking ? 'text-amber-300' : 'text-slate-400';

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      {speaking && (
        <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/15" />
      )}
      {thinking && (
        <span className="absolute inset-0 animate-pulse rounded-full bg-amber-400/10" />
      )}
      <div className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 ${borderColor} ${ringColor} transition-all duration-300`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className={`${iconColor} transition-colors duration-300`}>
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function MicTile({ speaking, muted }: { speaking: boolean; muted: boolean }) {
  return (
    <div className={`flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all duration-300 ${
      muted ? 'border-rose-400/50 bg-rose-400/10' :
      speaking ? 'border-emerald-400/70 bg-emerald-400/15' :
      'border-white/15 bg-white/5'
    }`}>
      {muted ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-rose-400">
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V6a3 3 0 00-5.94-.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v3M8 23h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={speaking ? 'text-emerald-400' : 'text-slate-400'}>
          <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 23h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

function StatusPill({ label, variant }: { label: string; variant: 'sky' | 'amber' | 'emerald' | 'slate' }) {
  const styles = {
    sky: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
    amber: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    emerald: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    slate: 'bg-white/5 text-slate-400 border-white/10',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles[variant]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        variant === 'sky' ? 'bg-sky-400 animate-pulse' :
        variant === 'amber' ? 'bg-amber-400 animate-pulse' :
        variant === 'emerald' ? 'bg-emerald-400' :
        'bg-slate-500'
      }`} />
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PipecatVoicePanel({
  sessionId,
  currentStage,
  currentQuestion,
  currentQuestionNumber,
  totalQuestions,
  onManualFallbackSubmit,
  onEndInterview,
}: {
  sessionId: string;
  currentStage: string;
  currentQuestion: string;
  currentQuestionNumber: number;
  totalQuestions: number;
  onManualFallbackSubmit: (transcript: string) => Promise<void>;
  onEndInterview: () => Promise<void>;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [manualAnswer, setManualAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const submitRef = useRef(0);

  const voice = usePipecatInterview({
    sessionId,
    currentStage,
    currentQuestion,
    onManualFallbackSubmit,
  });

  const isConnected = voice.connectionStatus === 'connected';

  const statusLabel = !isConnected
    ? (voice.connectionStatus === 'idle' ? 'Ready to start' : 'Connecting…')
    : voice.botSpeaking
    ? 'AI Speaking'
    : voice.botThinking
    ? 'Processing…'
    : 'Listening to you';

  const statusVariant: 'sky' | 'amber' | 'emerald' | 'slate' = !isConnected
    ? 'slate'
    : voice.botSpeaking
    ? 'sky'
    : voice.botThinking
    ? 'amber'
    : 'emerald';

  const progressPercent = totalQuestions > 0
    ? Math.min(100, Math.round(((currentQuestionNumber - 1) / totalQuestions) * 100))
    : 0;

  const hasAnswer = Boolean(voice.finalTranscript.trim() || manualAnswer.trim());

  const handleNextQuestion = async () => {
    const text = voice.finalTranscript.trim() || manualAnswer.trim();
    if (!text || isSubmitting) return;
    const id = submitRef.current + 1;
    submitRef.current = id;
    setIsSubmitting(true);
    try {
      await voice.submitAnswer(text);
      setManualAnswer('');
    } finally {
      if (submitRef.current === id) setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async () => {
    const text = manualAnswer.trim();
    if (!text || isSubmitting) return;
    const id = submitRef.current + 1;
    submitRef.current = id;
    setIsSubmitting(true);
    try {
      await voice.submitAnswer(text);
      setManualAnswer('');
    } finally {
      if (submitRef.current === id) setIsSubmitting(false);
    }
  };

  const handleEndInterview = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      await onEndInterview();
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Progress bar ────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Question {currentQuestionNumber} of {totalQuestions || '?'}</span>
          <span>{progressPercent}% complete</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/10">
          <div
            className="h-1.5 rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ── Presence tiles ──────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-[2rem] border border-white/10 bg-white/5 px-8 py-5">
        {/* AI side */}
        <div className="flex flex-col items-center gap-2">
          <AiPresence speaking={voice.botSpeaking} thinking={voice.botThinking} />
          <span className="text-xs text-slate-400">Interviewer</span>
        </div>

        {/* Status pill (centre) */}
        <StatusPill label={statusLabel} variant={statusVariant} />

        {/* Candidate side */}
        <div className="flex flex-col items-center gap-2">
          <MicTile speaking={voice.userSpeaking} muted={voice.isMuted} />
          <span className="text-xs text-slate-400">You</span>
        </div>
      </div>

      {/* ── Question card ────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-sky-300/20 bg-sky-300/5 p-6 space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Current Question</p>
        <p className="text-white text-base leading-relaxed">
          {voice.assistantTranscript || currentQuestion || 'Waiting for interviewer…'}
        </p>
      </div>

      {/* ── Live transcript ──────────────────────────────────────── */}
      {(voice.interimTranscript || voice.finalTranscript) && (
        <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/5 p-5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${voice.userSpeaking ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400/50'}`} />
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
              {voice.userSpeaking ? 'You speaking…' : 'Your answer'}
            </p>
          </div>
          {voice.interimTranscript && (
            <p className="text-slate-400 text-sm italic">{voice.interimTranscript}</p>
          )}
          {voice.finalTranscript && (
            <p className="text-white text-sm leading-relaxed">{voice.finalTranscript}</p>
          )}
        </div>
      )}

      {/* ── Primary controls ─────────────────────────────────────── */}
      {isConnected ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* Repeat question */}
          <button
            type="button"
            onClick={voice.repeatQuestion}
            className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Repeat question"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
            Repeat
          </button>

          {/* Mute toggle */}
          <button
            type="button"
            onClick={voice.toggleMute}
            className={`flex items-center gap-1.5 rounded-2xl border px-4 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              voice.isMuted
                ? 'border-rose-400/40 bg-rose-400/10 text-rose-300 hover:bg-rose-400/15'
                : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            aria-label={voice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {voice.isMuted ? 'Unmute' : 'Mute'}
          </button>

          {/* Done / Next question — primary action */}
          <button
            type="button"
            onClick={() => { void handleNextQuestion(); }}
            disabled={!hasAnswer || isSubmitting}
            className="flex-1 rounded-2xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50 hover:bg-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Submit answer and move to next question"
          >
            {isSubmitting ? 'Submitting…' : 'Done — Next question →'}
          </button>

          {/* End interview */}
          <button
            type="button"
            onClick={() => { void handleEndInterview(); }}
            disabled={isEnding}
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-slate-400 hover:bg-rose-400/10 hover:text-rose-300 hover:border-rose-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
            aria-label="End interview and generate report"
          >
            {isEnding ? 'Ending…' : 'End interview'}
          </button>
        </div>
      ) : (
        /* ── Start button (pre-connection) ──────────────────────── */
        <button
          type="button"
          onClick={() => { void voice.startInterview(); }}
          disabled={voice.kokoroLoading}
          className="w-full rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60 hover:bg-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          {voice.kokoroLoading ? 'Loading audio…' : 'Start Interview'}
        </button>
      )}

      {/* ── Errors & warnings ────────────────────────────────────── */}
      {voice.micPermissionStatus === 'denied' && (
        <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100" role="alert">
          Microphone access was denied. Enable it in browser settings and reconnect.
        </p>
      )}
      {voice.error && (
        <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100" role="alert">
          {voice.error}
        </p>
      )}

      {/* ── Type instead toggle ───────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setTypeOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 focus:outline-none"
        >
          <svg
            className={`h-3 w-3 transition-transform ${typeOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16" fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {typeOpen ? 'Hide text input' : 'Type instead'}
        </button>

        {typeOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              value={manualAnswer}
              onChange={(e) => setManualAnswer(e.target.value)}
              rows={4}
              className="w-full rounded-[2rem] border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none resize-none focus:border-emerald-400/50 placeholder-slate-600"
              placeholder="Type your answer here if voice isn't working…"
            />
            <button
              type="button"
              onClick={() => { void handleManualSubmit(); }}
              disabled={!manualAnswer.trim() || isSubmitting}
              className="w-full rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting…' : 'Submit typed answer'}
            </button>
          </div>
        )}
      </div>

      {/* ── Technical details (dev only) ─────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setDebugOpen((v) => !v)}
          className="text-xs text-slate-600 hover:text-slate-400 focus:outline-none"
        >
          {debugOpen ? '▲ Hide' : '▼ Technical details'}
        </button>

        {debugOpen && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-3 text-xs text-slate-400">
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
              <p>{voice.kokoroError ? `Error: ${voice.kokoroError}` : voice.kokoroReady ? 'Ready' : voice.kokoroLoading ? 'Loading…' : voice.kokoroSupported ? 'Idle' : 'Not supported'}</p>
              {voice.voices.length > 0 && (
                <select
                  value={voice.selectedVoice}
                  onChange={(e) => voice.setVoice(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none mt-1"
                >
                  {voice.voices.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                  ))}
                </select>
              )}
            </div>
            <button
              type="button"
              onClick={() => { void voice.disconnect(); }}
              className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
