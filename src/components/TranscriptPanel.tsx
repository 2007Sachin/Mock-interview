export function TranscriptPanel({
  transcript,
  onChange,
}: {
  transcript: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-white">Answer transcript</p>
      <textarea
        value={transcript}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        className="w-full rounded-[2rem] border border-white/10 bg-slate-950 px-4 py-4 text-sm text-slate-100 outline-none"
        placeholder="Speak your answer or type here if voice recognition is unavailable."
      />
    </div>
  );
}
