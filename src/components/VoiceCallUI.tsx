import type { ReactNode } from 'react';

// Shared presentational pieces for the interview "live call" surface.
// Used by both VoiceAgentPanel (browser provider) and PipecatVoicePanel.

/**
 * Fixed bottom control bar, styled like a video-call toolbar. Children are the
 * call controls (Repeat, Mute, Next question, End interview).
 */
export function ControlBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-edge/30 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-6 py-4">{children}</div>
    </div>
  );
}

export function QuestionCard({ text }: { text: string }) {
  return (
    <div className="space-y-1 rounded-3xl border border-info/20 bg-info/5 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-info">Current question</p>
      <p className="text-lg font-medium leading-relaxed text-ink">{text || 'Waiting for the interviewer…'}</p>
    </div>
  );
}

export function TranscriptCard({
  interimText,
  finalText,
  userSpeaking,
}: {
  interimText: string;
  finalText: string;
  userSpeaking: boolean;
}) {
  return (
    <div className="space-y-1.5 rounded-3xl border border-accent/20 bg-accent/5 p-5" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${userSpeaking ? 'animate-pulse bg-accent' : 'bg-accent/50'}`} />
        <p className="text-xs uppercase tracking-[0.3em] text-accent">
          {userSpeaking ? 'You are speaking…' : 'Your answer'}
        </p>
      </div>
      {finalText && <p className="text-sm leading-relaxed text-ink">{finalText}</p>}
      {interimText && <p className="text-sm italic text-ink-secondary">{interimText}</p>}
      {!finalText && !interimText && (
        <p className="text-sm italic text-ink-muted">Start speaking and your words will appear here.</p>
      )}
    </div>
  );
}

export function QuestionProgress({ current, total }: { current: number; total: number }) {
  const safeTotal = Math.max(total, current);
  const percent = safeTotal > 0 ? Math.min(100, Math.round(((current - 1) / safeTotal) * 100)) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-ink-secondary">
        <span>
          Question {current} of {safeTotal || '?'}
        </span>
        <span>{percent}% complete</span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-surface-raised"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Interview progress"
      >
        <div className="h-1.5 rounded-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export const buttonStyles = {
  primary:
    'rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong active:bg-accent disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  secondary:
    'flex items-center gap-1.5 rounded-2xl border border-edge/40 bg-surface px-4 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  danger:
    'rounded-2xl border border-edge/40 bg-surface px-4 py-2.5 text-sm text-ink-secondary transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  mutedActive:
    'flex items-center gap-1.5 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger transition-colors hover:bg-danger/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
} as const;

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
      {children}
    </p>
  );
}
