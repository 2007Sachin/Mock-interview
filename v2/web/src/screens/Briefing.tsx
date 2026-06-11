import type { Session } from '../lib/types';

export function Briefing({ session, onContinue }: { session: Session; onContinue: () => void }) {
  const count = session.brief.questionBank.length;
  const minutes = count * 3;

  return (
    <div className="card">
      <h2>{session.brief.title}</h2>
      <p className="subtle">{session.brief.summary}</p>

      <div className="briefing-grid">
        <div className="briefing-stat">
          <strong>{count}</strong>
          <span>questions</span>
        </div>
        <div className="briefing-stat">
          <strong>~{minutes} min</strong>
          <span>expected length</span>
        </div>
      </div>

      {session.brief.focusAreas.length > 0 && (
        <>
          <h3>What we&apos;ll focus on</h3>
          <ul>
            {session.brief.focusAreas.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </>
      )}

      <h3>How it works</h3>
      <ul>
        <li>Each question is shown on screen and read aloud.</li>
        <li>Click <strong>Answer</strong>, speak naturally, then click <strong>Done</strong>.</li>
        <li>You can repeat a question, skip it, or type your answer instead.</li>
        <li>You can end the interview at any time.</li>
      </ul>

      <button className="btn btn-primary" onClick={onContinue}>
        Continue to mic check
      </button>
    </div>
  );
}
