import { FormEvent, useState } from 'react';

export function AccessCodeForm({
  onSubmit,
  isSubmitting,
  errorMessage,
}: {
  onSubmit: (accessCode: string) => Promise<void>;
  isSubmitting: boolean;
  errorMessage: string | null;
}) {
  const [accessCode, setAccessCode] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(accessCode);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <div>
        <p className="text-sm text-slate-300">Enter the access code from Pathwisse LMS.</p>
      </div>
      <input
        value={accessCode}
        onChange={(event) => setAccessCode(event.target.value)}
        placeholder="839-221"
        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-white outline-none"
      />
      {errorMessage ? (
        <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Verifying…' : 'Start Interview'}
      </button>
    </form>
  );
}
