import type { ReactNode } from 'react';

// Shared presentational pieces for the interview "live call" surface.
// Used by both VoiceAgentPanel (browser provider) and PipecatVoicePanel.

export type StatusVariant = 'info' | 'warning' | 'accent' | 'neutral' | 'danger';

const STATUS_STYLES: Record<StatusVariant, { pill: string; dot: string }> = {
  info: { pill: 'bg-info/15 text-info border-info/30', dot: 'bg-info animate-pulse' },
  warning: { pill: 'bg-warning/15 text-warning border-warning/30', dot: 'bg-warning animate-pulse' },
  accent: { pill: 'bg-accent/15 text-accent border-accent/30', dot: 'bg-accent animate-pulse' },
  neutral: { pill: 'bg-surface-raised/60 text-ink-secondary border-edge/30', dot: 'bg-ink-muted' },
  danger: { pill: 'bg-danger/15 text-danger border-danger/30', dot: 'bg-danger' },
};

export function StatusPill({ label, variant }: { label: string; variant: StatusVariant }) {
  const styles = STATUS_STYLES[variant];
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {label}
    </span>
  );
}

export function AiPresence({ speaking, thinking }: { speaking: boolean; thinking: boolean }) {
  const borderColor = speaking ? 'border-info/70 bg-info/20' : thinking ? 'border-warning/70 bg-warning/20' : 'border-edge/40 bg-surface-raised/40';
  const iconColor = speaking ? 'text-info' : thinking ? 'text-warning' : 'text-ink-muted';

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      {speaking && <span className="absolute inset-0 animate-ping rounded-full bg-info/15" />}
      {thinking && <span className="absolute inset-0 animate-pulse rounded-full bg-warning/10" />}
      <div className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all duration-300 ${borderColor}`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${iconColor} transition-colors duration-300`}>
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export function MicTile({ speaking, muted }: { speaking: boolean; muted: boolean }) {
  return (
    <div
      className={`flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all duration-300 ${
        muted
          ? 'border-danger/50 bg-danger/10'
          : speaking
            ? 'border-accent/70 bg-accent/15'
            : 'border-edge/40 bg-surface-raised/40'
      }`}
    >
      {muted ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-danger">
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V6a3 3 0 00-5.94-.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v3M8 23h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={speaking ? 'text-accent' : 'text-ink-muted'}>
          <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 23h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

export function PresenceRow({
  botSpeaking,
  botThinking,
  userSpeaking,
  isMuted,
  statusLabel,
  statusVariant,
}: {
  botSpeaking: boolean;
  botThinking: boolean;
  userSpeaking: boolean;
  isMuted: boolean;
  statusLabel: string;
  statusVariant: StatusVariant;
}) {
  return (
    <div className="flex items-center justify-between rounded-3xl border border-edge/30 bg-surface px-8 py-5">
      <div className="flex flex-col items-center gap-2">
        <AiPresence speaking={botSpeaking} thinking={botThinking} />
        <span className="text-xs text-ink-secondary">Interviewer</span>
      </div>

      <StatusPill label={statusLabel} variant={statusVariant} />

      <div className="flex flex-col items-center gap-2">
        <MicTile speaking={userSpeaking} muted={isMuted} />
        <span className="text-xs text-ink-secondary">You</span>
      </div>
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
