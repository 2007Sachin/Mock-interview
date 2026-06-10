export type InterviewerState = 'speaking' | 'listening' | 'thinking' | 'idle';

const STATE_LABELS: Record<InterviewerState, (name: string) => string> = {
  speaking: (name) => `${name} is speaking…`,
  listening: (name) => `${name} is listening`,
  thinking: (name) => `${name} is thinking…`,
  idle: (name) => `${name} is ready`,
};

const STATE_DOT: Record<InterviewerState, string> = {
  speaking: 'bg-info animate-pulse',
  listening: 'bg-accent',
  thinking: 'bg-warning animate-pulse',
  idle: 'bg-ink-muted',
};

/** Bar heights cycle through CSS keyframes; offsets desynchronize the bars. */
const WAVEFORM_DELAYS = ['0s', '0.18s', '0.36s', '0.12s', '0.28s'];

/**
 * Abstract animated interviewer presence — an orb rendered with SVG + CSS
 * keyframes (no canvas, no libraries). Visual states:
 *  - speaking:  waveform bars pulse inside the orb, outer ring pulses
 *  - listening: calm slow ripple; ripples quicken slightly with `activity`
 *  - thinking:  conic shimmer ring rotates around the orb
 *  - idle:      soft static glow
 * Animations are defined in styles.css and disabled by prefers-reduced-motion.
 */
export function InterviewerAvatar({
  state,
  name,
  activity = false,
  size = 'md',
  statusOverride,
}: {
  state: InterviewerState;
  name: string;
  /** True while the student's transcript is actively arriving. */
  activity?: boolean;
  size?: 'md' | 'lg';
  /** Replaces the default "<name> is …" label (e.g. "Mic muted"). */
  statusOverride?: string;
}) {
  const dimension = size === 'lg' ? 'h-44 w-44' : 'h-32 w-32';
  const coreDimension = size === 'lg' ? 'h-32 w-32' : 'h-24 w-24';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`avatar-root relative flex items-center justify-center ${dimension}`} data-state={state} aria-hidden="true">
        {/* Listening ripples */}
        {state === 'listening' && (
          <>
            <span className={`avatar-ripple absolute inset-0 rounded-full border-2 border-accent/40 ${activity ? 'avatar-ripple-active' : ''}`} />
            <span
              className={`avatar-ripple absolute inset-0 rounded-full border-2 border-accent/25 ${activity ? 'avatar-ripple-active' : ''}`}
              style={{ animationDelay: '1.4s' }}
            />
          </>
        )}

        {/* Speaking pulse halo */}
        {state === 'speaking' && <span className="avatar-halo absolute inset-1 rounded-full bg-info/15" />}

        {/* Thinking shimmer ring */}
        {state === 'thinking' && <span className="avatar-shimmer absolute inset-0 rounded-full" />}

        {/* Core orb */}
        <div
          className={`avatar-core relative z-10 flex items-center justify-center rounded-full transition-all duration-500 ${coreDimension}`}
        >
          {state === 'speaking' ? (
            <div className="flex h-10 items-end gap-1.5">
              {WAVEFORM_DELAYS.map((delay, index) => (
                <span
                  key={index}
                  className="avatar-wave-bar w-1.5 rounded-full bg-info"
                  style={{ animationDelay: delay }}
                />
              ))}
            </div>
          ) : (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="avatar-glyph text-ink-secondary">
              <circle cx="12" cy="12" r="3.2" fill="currentColor" opacity="0.9" />
              <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
            </svg>
          )}
        </div>
      </div>

      {/* Name + status label */}
      <div className="flex flex-col items-center gap-0.5" role="status" aria-live="polite">
        <p className="text-sm font-semibold text-ink">{name}</p>
        <p className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state]}`} />
          {statusOverride ?? STATE_LABELS[state](name)}
        </p>
      </div>
    </div>
  );
}
