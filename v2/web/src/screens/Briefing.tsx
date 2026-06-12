import { Button, Card, NavBar } from '../components/ui';
import type { Session } from '../lib/types';

export function Briefing({
  session,
  onBack,
  onContinue,
}: {
  session: Session;
  onBack: () => void;
  onContinue: () => void;
}) {
  const count = session.brief.questionBank.length;
  const minutes = count * 3;

  return (
    <Card>
      <h2 className="text-2xl font-bold tracking-tight">{session.brief.title}</h2>
      <p className="mt-1 text-ink-secondary">{session.brief.summary}</p>

      <div className="mt-5 flex gap-3">
        <div className="flex flex-1 flex-col rounded-xl bg-primary-soft px-5 py-3.5">
          <strong className="text-xl text-primary-strong">{count}</strong>
          <span className="text-sm text-ink-secondary">questions</span>
        </div>
        <div className="flex flex-1 flex-col rounded-xl bg-primary-soft px-5 py-3.5">
          <strong className="text-xl text-primary-strong">~{minutes} min</strong>
          <span className="text-sm text-ink-secondary">expected length</span>
        </div>
      </div>

      {session.brief.focusAreas.length > 0 && (
        <>
          <h3 className="mt-6 mb-1 font-semibold">What we&apos;ll focus on</h3>
          <ul className="list-disc space-y-1 pl-5 text-ink-secondary">
            {session.brief.focusAreas.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mt-6 mb-1 font-semibold">How it works</h3>
      <ul className="list-disc space-y-1 pl-5 text-ink-secondary">
        <li>Each question is shown on screen and read aloud.</li>
        <li>
          Click <strong>Answer</strong>, speak naturally, then click <strong>Done</strong>.
        </li>
        <li>You can repeat a question, skip it, or type your answer instead.</li>
        <li>You can end the interview at any time and still get your report.</li>
      </ul>

      <NavBar onBack={onBack} backLabel="Start over">
        <Button variant="primary" onClick={onContinue}>
          Continue to mic check →
        </Button>
      </NavBar>
    </Card>
  );
}
