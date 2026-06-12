const STEPS = ['Setup', 'Briefing', 'Mic check', 'Meet', 'Interview', 'Report'] as const;

export type StepName = (typeof STEPS)[number];

/** Always-visible progress trail so users know where they are and what's next. */
export function Stepper({ current }: { current: StepName }) {
  const activeIndex = STEPS.indexOf(current);
  return (
    <nav aria-label="Progress" className="no-print mb-7">
      <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide">
        {STEPS.map((step, i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
          return (
            <li key={step} className="flex items-center gap-2">
              {i > 0 && <span className="text-edge">—</span>}
              <span
                aria-current={state === 'active' ? 'step' : undefined}
                className={
                  state === 'active'
                    ? 'rounded-full bg-primary px-3 py-1 text-white'
                    : state === 'done'
                      ? 'rounded-full bg-primary-soft px-3 py-1 text-primary-strong'
                      : 'rounded-full bg-surface-muted px-3 py-1 text-ink-muted'
                }
              >
                {state === 'done' ? '✓ ' : ''}
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
