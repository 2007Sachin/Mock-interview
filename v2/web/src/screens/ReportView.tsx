import { useEffect, useState } from 'react';
import { getReport, retryReport } from '../lib/api';
import type { Report, Session, SwotPoint } from '../lib/types';

const POLL_MS = 2500;

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; report: Report };

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
      <div className="card card-center">
        <h2>Preparing your evaluation…</h2>
        <p className="subtle">
          The interviewer is reviewing your answers. This usually takes a few seconds.
        </p>
        <div className="loading-bar" aria-hidden>
          <div />
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="card card-center">
        <h2>We hit a snag</h2>
        <p className="subtle">{state.message} Your answers are saved — you can retry safely.</p>
        <button className="btn btn-primary" onClick={retry}>
          Retry evaluation
        </button>
      </div>
    );
  }

  const { report } = state;
  return (
    <div className="report">
      <div className="card report-overall">
        <div>
          <h2>Interview report</h2>
          <p className="subtle">{session.brief.title}</p>
          <p>{report.overall.summary}</p>
        </div>
        <div className="report-score">
          <strong>{report.overall.score}</strong>
          <span>/ 100</span>
          <em className={`readiness readiness-${report.overall.readinessLevel.replace(/\s+/g, '-')}`}>
            {report.overall.readinessLevel}
          </em>
        </div>
      </div>

      <div className="swot-grid">
        <SwotCard title="Strengths" tone="strengths" points={report.swot.strengths} />
        <SwotCard title="Weaknesses" tone="weaknesses" points={report.swot.weaknesses} />
        <SwotCard title="Opportunities" tone="opportunities" points={report.swot.opportunities} />
        <SwotCard title="Threats" tone="threats" points={report.swot.threats} />
      </div>

      {report.perQuestion.length > 0 && (
        <>
          <h3 className="report-section-title">Question by question</h3>
          {report.perQuestion.map((q, i) => (
            <div className="card question-card" key={i}>
              <div className="question-card-header">
                <strong>
                  Q{i + 1}. {q.question}
                </strong>
                <span className="question-score">{q.score}/10</span>
              </div>
              {q.answerSummary && <p className="muted">You said: {q.answerSummary}</p>}
              {q.feedback && <p>{q.feedback}</p>}
              {q.howToImprove && (
                <p className="improve">
                  <strong>How to improve:</strong> {q.howToImprove}
                </p>
              )}
            </div>
          ))}
        </>
      )}

      <div className="report-actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>
          Download / print report
        </button>
        <button className="btn btn-secondary" onClick={onRestart}>
          Start another interview
        </button>
      </div>
    </div>
  );
}

function SwotCard({ title, tone, points }: { title: string; tone: string; points: SwotPoint[] }) {
  return (
    <div className={`card swot-card swot-${tone}`}>
      <h3>{title}</h3>
      {points.length === 0 ? (
        <p className="muted">Nothing notable here this time.</p>
      ) : (
        <ul>
          {points.map((p, i) => (
            <li key={i}>
              {p.point}
              {p.evidence && <span className="evidence"> — “{p.evidence}”</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
