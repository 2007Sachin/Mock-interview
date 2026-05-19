import { INTERVIEW_STAGES } from '@/lib/stageEngine';

export function StageProgress({ currentStage }: { currentStage: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {INTERVIEW_STAGES.map((stage) => {
        const isActive = stage.id === currentStage;
        return (
          <div
            key={stage.id}
            className={`rounded-2xl border px-4 py-3 text-sm ${
              isActive ? 'border-emerald-300 bg-emerald-300/10 text-white' : 'border-white/10 bg-white/5 text-slate-300'
            }`}
          >
            <p className="font-semibold">{stage.label}</p>
            <p className="text-xs uppercase tracking-widest opacity-70">{stage.questionCount} questions</p>
          </div>
        );
      })}
    </div>
  );
}
