export function InterviewQuestion({
  stage,
  question,
  questionNumber,
  totalQuestionsInStage,
}: {
  stage: string;
  question: string;
  questionNumber: number;
  totalQuestionsInStage: number;
}) {
  return (
    <div className="space-y-3 rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
        <span>{stage.replace(/_/g, ' ')}</span>
        <span>{questionNumber} / {totalQuestionsInStage}</span>
      </div>
      <p className="text-2xl font-semibold text-white">{question}</p>
    </div>
  );
}
