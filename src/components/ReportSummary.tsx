import { InterviewReport } from '@/types/interview';

export function ReportSummary({ report }: { report: InterviewReport }) {
  return (
    <div className="space-y-6 rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-emerald-200">Interview Report</p>
          <h2 className="text-3xl font-bold text-white">{report.overallScore}</h2>
        </div>
        <p className="text-sm text-slate-300">{report.status}</p>
      </div>

      <p className="text-slate-200">{report.summary}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-white">Strengths</p>
          <ul className="space-y-2 text-sm text-slate-300">
            {report.strengths.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-white">Improvements</p>
          <ul className="space-y-2 text-sm text-slate-300">
            {report.improvements.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(report.stageScores).map(([stage, score]) => (
          <div key={stage} className="rounded-2xl border border-white/10 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">{stage.replace(/_/g, ' ')}</p>
            <p className="text-lg font-semibold text-white">{score}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
