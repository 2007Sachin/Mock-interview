import { useEffect, useState } from 'react';
import { Button, Card } from '../components/ui';
import { getReport, retryReport } from '../lib/api';
import type { Report, Session, SwotPoint } from '../lib/types';

const POLL_MS = 2500;

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; report: Report };

const READINESS_COLOR: Record<Report['overall']['readinessLevel'], string> = {
  'interview ready': 'text-success',
  'getting there': 'text-accent',
  'needs practice': 'text-danger',
};

const SWOT_BORDER: Record<string, string> = {
  Strengths: 'border-t-success',
  Weaknesses: 'border-t-danger',
  Opportunities: 'border-t-primary',
  Threats: 'border-t-accent',
};

export function ReportView({ session, onRestart }: { session: Session; onRestart: () => void }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [pollNonce, setPollNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const { status, report } = await getReport(session.id);
        if (cancelled) return;
        if (status === 'ready' && report) {
          setState({ phase: 'ready', report });
        } else if (status === 'error') {
          setState({ phase: 'error', message: 'Generating your evaluation failed.' });
        } else {
          timer = window.setTimeout(poll, POLL_MS);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(poll, POLL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session.id, pollNonce]);

  async function retry() {
    setState({ phase: 'loading' });
    await retryReport(session.id).catch(() => undefined);
    setPollNonce((n) => n + 1);
  }

  if (state.phase === 'loading') {
    return (
      <Card className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">Preparing your evaluation…</h2>
        <p className="mt-1 text-ink-secondary">
          The interviewer is reviewing your answers. This usually takes a few seconds.
        </p>
        <div className="loading-bar mt-5" aria-hidden>
          <div />
        </div>
      </Card>
    );
  }

  if (state.phase === 'error') {
    return (
      <Card className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">We hit a snag</h2>
        <p className="mt-1 mb-5 text-ink-secondary">
          {state.message} Your answers are saved — you can retry safely.
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="primary" onClick={retry}>
            Retry evaluation
          </Button>
          <Button onClick={onRestart}>Back to start</Button>
        </div>
      </Card>
    );
  }

  const { report } = state;
  return (
    <div>
      <Card className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Interview report</h2>
          <p className="text-ink-secondary">{session.brief.title}</p>
          <p className="mt-3">{report.overall.summary}</p>
        </div>
        <div className="shrink-0 rounded-xl bg-primary-soft px-7 py-4 text-center">
          <strong className="block text-4xl leading-none text-primary-strong">
            {report.overall.score}
          </strong>
          <span className="text-sm text-ink-muted">/ 100</span>
          <em
            className={`mt-2 block text-sm font-semibold capitalize not-italic ${READINESS_COLOR[report.overall.readinessLevel]}`}
          >
            {report.overall.readinessLevel}
          </em>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SwotCard title="Strengths" points={report.swot.strengths} />
        <SwotCard title="Weaknesses" points={report.swot.weaknesses} />
        <SwotCard title="Opportunities" points={report.swot.opportunities} />
        <SwotCard title="Threats" points={report.swot.threats} />
      </div>

      {report.perQuestion.length > 0 && (
        <>
          <h3 className="mt-7 mb-3 text-lg font-bold">Question by question</h3>
          <div className="space-y-3">
            {report.perQuestion.map((q, i) => (
              <Card key={i} className="!p-6">
                <div className="flex items-baseline justify-between gap-4">
                  <strong>
                    Q{i + 1}. {q.question}
                  </strong>
                  <span className="shrink-0 font-bold text-primary-strong">{q.score}/10</span>
                </div>
                {q.answerSummary && (
                  <p className="mt-2 text-sm text-ink-muted">You said: {q.answerSummary}</p>
                )}
                {q.feedback && <p className="mt-2">{q.feedback}</p>}
                {q.howToImprove && (
                  <p className="mt-3 rounded-lg bg-accent-soft px-3.5 py-2.5 text-sm">
                    <strong>How to improve:</strong> {q.howToImprove}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="no-print mt-6 flex gap-3">
        <Button variant="primary" onClick={() => window.print()}>
          Download / print report
        </Button>
        <Button onClick={onRestart}>Start another interview</Button>
      </div>
    </div>
  );
}

function SwotCard({ title, points }: { title: string; points: SwotPoint[] }) {
  return (
    <Card className={`border-t-4 !p-5 ${SWOT_BORDER[title] ?? ''}`}>
      <h3 className="mb-2 font-bold">{title}</h3>
      {points.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing notable here this time.</p>
      ) : (
        <ul className="list-disc space-y-2 pl-4 text-sm text-ink-secondary">
          {points.map((p, i) => (
            <li key={i}>
              <span className="text-ink">{p.point}</span>
              {p.evidence && <span className="text-ink-muted"> — “{p.evidence}”</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
