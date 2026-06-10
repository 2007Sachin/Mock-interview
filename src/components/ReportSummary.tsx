import { InterviewReport, QuestionEvaluation } from '@/types/interview';

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' :
    score >= 65 ? 'text-sky-300 border-sky-400/30 bg-sky-400/10' :
    score >= 50 ? 'text-amber-300 border-amber-400/30 bg-amber-400/10' :
    'text-rose-300 border-rose-400/30 bg-rose-400/10';
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {score}
    </span>
  );
}

function QuestionCard({ item, index }: { item: QuestionEvaluation; index: number }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-0.5">
          <p className="text-xs uppercase tracking-widest text-slate-500">Q{index + 1}</p>
          <p className="text-sm font-medium text-white leading-snug">{item.question}</p>
        </div>
        <ScoreBadge score={item.score} />
      </div>

      {/* Answer summary */}
      {item.answerSummary && (
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Your answer</p>
          <p className="text-sm text-slate-300 leading-relaxed">{item.answerSummary}</p>
        </div>
      )}

      {/* Feedback */}
      {item.feedback && (
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Feedback</p>
          <p className="text-sm text-slate-200 leading-relaxed">{item.feedback}</p>
        </div>
      )}

      {/* How to improve — visually distinct */}
      {item.improvement && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-emerald-300 mb-1">How to improve</p>
          <p className="text-sm text-emerald-100 leading-relaxed">{item.improvement}</p>
        </div>
      )}
    </div>
  );
}

export function ReportSummary({ report }: { report: InterviewReport }) {
  const hasEvaluations = (report.questionEvaluations?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* ── Overall score card ─────────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-emerald-200">Interview Report</p>
            <h2 className="text-4xl font-bold text-white mt-1">{report.overallScore}</h2>
            <p className="text-slate-400 text-sm mt-0.5">Overall score</p>
          </div>
          <span className="text-sm text-slate-400">{report.status}</span>
        </div>

        <p className="text-slate-200 leading-relaxed">{report.summary}</p>

        {/* Component scores */}
        <div className="grid gap-3 sm:grid-cols-4">
          {report.communicationScore != null && (
            <div className="rounded-2xl border border-white/10 px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Communication</p>
              <p className="text-lg font-semibold text-white mt-0.5">{report.communicationScore}</p>
            </div>
          )}
          {report.technicalScore != null && (
            <div className="rounded-2xl border border-white/10 px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Technical</p>
              <p className="text-lg font-semibold text-white mt-0.5">{report.technicalScore}</p>
            </div>
          )}
          {report.behavioralScore != null && (
            <div className="rounded-2xl border border-white/10 px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Behavioral</p>
              <p className="text-lg font-semibold text-white mt-0.5">{report.behavioralScore}</p>
            </div>
          )}
          {report.jdAlignmentScore != null && (
            <div className="rounded-2xl border border-white/10 px-4 py-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Alignment</p>
              <p className="text-lg font-semibold text-white mt-0.5">{report.jdAlignmentScore}</p>
            </div>
          )}
        </div>

        {/* Strengths + improvements */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-white">Strengths</p>
            <ul className="space-y-1.5 text-sm text-slate-300">
              {report.strengths.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-white">Areas to improve</p>
            <ul className="space-y-1.5 text-sm text-slate-300">
              {report.improvements.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Stage scores */}
        {Object.keys(report.stageScores).length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(report.stageScores).map(([stage, score]) => (
              <div key={stage} className="rounded-2xl border border-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-slate-400">{stage.replace(/_/g, ' ')}</p>
                <p className="text-lg font-semibold text-white mt-0.5">{score}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Per-question breakdown ─────────────────────────────── */}
      {hasEvaluations && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
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
