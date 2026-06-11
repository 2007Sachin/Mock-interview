import { memo, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Shared presentational pieces for the interview "live call" surface.
// Used by both VoiceAgentPanel (browser provider) and PipecatVoicePanel.
// Cards are memoized so per-keystroke transcript updates in the panels only
// re-render the pieces whose props actually changed.

/**
 * Fixed bottom control bar, styled like a video-call toolbar. Children are the
 * call controls (Repeat, Mute, Next question, End interview). Rendered through
 * a portal: the panels sit inside entrance-animated (transformed) containers,
 * which would otherwise become the containing block for position: fixed and
 * pin the bar mid-page instead of to the viewport.
 */
export function ControlBar({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="control-bar-enter fixed inset-x-0 bottom-0 z-20 border-t border-edge/30 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-6 py-4">{children}</div>
    </div>,
    document.body,
  );
}

/**
 * Current question card. When the question changes, the old text animates out
 * (150ms) before the new one rises in, instead of hard-swapping.
 */
export const QuestionCard = memo(function QuestionCard({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (text === shown) return;
    if (!shown.trim()) {
      setShown(text);
      return;
    }

    setLeaving(true);
    const timer = window.setTimeout(() => {
      setShown(text);
      setLeaving(false);
    }, 150); // matches the qswap-out duration in styles.css
    return () => window.clearTimeout(timer);
  }, [text, shown]);

  return (
    <div className="space-y-1 rounded-3xl border border-info/20 bg-info/5 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-info">Current question</p>
      <p
        key={shown || 'empty'}
        className={`text-lg font-medium leading-relaxed text-ink ${leaving ? 'qswap-exit' : 'qswap-enter'}`}
      >
        {shown || 'Waiting for the interviewer…'}
      </p>
    </div>
  );
});

export const TranscriptCard = memo(function TranscriptCard({
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
      {finalText && (
        <p key={finalText} className="transcript-pop text-sm leading-relaxed text-ink">
          {finalText}
        </p>
      )}
      {interimText && <p className="text-sm italic text-ink-secondary">{interimText}</p>}
      {!finalText && !interimText && (
        <p className="text-sm italic text-ink-muted">Start speaking and your words will appear here.</p>
      )}
    </div>
  );
});

export const QuestionProgress = memo(function QuestionProgress({ current, total }: { current: number; total: number }) {
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
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Interview progress"
      >
        <div
          className="progress-fill h-1.5 w-full rounded-full bg-accent"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
    </div>
  );
});

// `btn-press` supplies press feedback (transform) plus the color transitions.
export const buttonStyles = {
  primary:
    'btn-press rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  secondary:
    'btn-press flex items-center gap-1.5 rounded-2xl border border-edge/40 bg-surface px-4 py-2.5 text-sm text-ink-secondary hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  danger:
    'btn-press rounded-2xl border border-edge/40 bg-surface px-4 py-2.5 text-sm text-ink-secondary hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  mutedActive:
    'btn-press flex items-center gap-1.5 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger hover:bg-danger/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
} as const;

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
      {children}
    </p>
  );
}
