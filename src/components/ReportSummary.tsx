import { InterviewReport, QuestionEvaluation } from '@/types/interview';

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'text-accent border-accent/30 bg-accent/10' :
    score >= 65 ? 'text-info border-info/30 bg-info/10' :
    score >= 50 ? 'text-warning border-warning/30 bg-warning/10' :
    'text-danger border-danger/30 bg-danger/10';
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {score}
    </span>
  );
}

function ScoreTile({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-2xl border border-edge/30 bg-surface-raised/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink">{score}</p>
    </div>
  );
}

function QuestionCard({ item, index }: { item: QuestionEvaluation; index: number }) {
  return (
    <div className="space-y-3 rounded-3xl border border-edge/30 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-0.5">
          <p className="text-xs uppercase tracking-widest text-ink-muted">Q{index + 1}</p>
          <p className="text-sm font-medium leading-snug text-ink">{item.question}</p>
        </div>
        <ScoreBadge score={item.score} />
      </div>

      {item.answerSummary && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-ink-muted">Your answer</p>
          <p className="text-sm leading-relaxed text-ink-secondary">{item.answerSummary}</p>
        </div>
      )}

      {item.feedback && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-ink-muted">Feedback</p>
          <p className="text-sm leading-relaxed text-ink">{item.feedback}</p>
        </div>
      )}

      {item.improvement && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
          <p className="mb-1 text-xs uppercase tracking-wider text-accent">How to improve</p>
          <p className="text-sm leading-relaxed text-ink">{item.improvement}</p>
        </div>
      )}
    </div>
  );
}

export function ReportSummary({ report }: { report: InterviewReport }) {
  const hasEvaluations = (report.questionEvaluations?.length ?? 0) > 0;
  const componentScores: Array<{ label: string; score: number | null }> = [
    { label: 'Communication', score: report.communicationScore },
    { label: 'Technical', score: report.technicalScore },
    { label: 'Behavioral', score: report.behavioralScore },
    { label: 'Alignment', score: report.jdAlignmentScore },
  ];

  return (
    <div className="space-y-6">
      {/* Overall score card */}
      <div className="space-y-5 rounded-3xl border border-edge/30 bg-surface p-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-accent">Interview Report</p>
            <h2 className="mt-1 text-4xl font-bold text-ink">{report.overallScore}</h2>
            <p className="mt-0.5 text-sm text-ink-secondary">Overall score</p>
          </div>
          <span className="text-sm text-ink-secondary">{report.status}</span>
        </div>

        <p className="leading-relaxed text-ink">{report.summary}</p>

        <div className="grid gap-3 sm:grid-cols-4">
          {componentScores.map(({ label, score }) =>
            score != null ? <ScoreTile key={label} label={label} score={score} /> : null,
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Strengths</p>
            <ul className="space-y-1.5 text-sm text-ink-secondary">
              {report.strengths.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Areas to improve</p>
            <ul className="space-y-1.5 text-sm text-ink-secondary">
              {report.improvements.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {Object.keys(report.stageScores).length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(report.stageScores).map(([stage, score]) => (
              <ScoreTile key={stage} label={stage.replace(/_/g, ' ')} score={score} />
            ))}
          </div>
        )}
      </div>

      {/* Per-question breakdown */}
      {hasEvaluations && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-ink-secondary">
            Question-by-question feedback
          </h3>
          {report.questionEvaluations!.map((item, i) => (
            <QuestionCard key={i} item={item} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
