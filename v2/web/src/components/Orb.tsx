export type OrbState = 'idle' | 'speaking' | 'listening' | 'thinking';

/**
 * The interviewer's visual presence: an abstract orb (pure CSS) whose
 * animation follows the turn state machine — SPEAKING while the question
 * is read aloud, LISTENING while recording, THINKING while transcribing
 * or waiting on the LLM.
 */
export function Orb({ state }: { state: OrbState }) {
  return (
    <div className="orb" data-state={state} aria-hidden>
      <div className="orb-core" />
      <div className="orb-ring" />
      <div className="orb-ring orb-ring-2" />
    </div>
  );
}
