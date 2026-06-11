import { FormEvent, useState } from 'react';
import { buttonStyles } from '@/components/VoiceCallUI';

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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-[2rem] border border-edge/30 bg-surface p-6">
      <p className="text-sm text-ink-secondary">Enter the access code from Pathwisse LMS.</p>
      <input
        value={accessCode}
        onChange={(event) => setAccessCode(event.target.value)}
        placeholder="839-221"
        className="w-full rounded-2xl border border-edge/40 bg-canvas px-4 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-ink outline-none placeholder:text-ink-muted focus:border-accent/50"
      />
      {errorMessage ? (
        <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting} className={`w-full py-3 ${buttonStyles.primary}`}>
        {isSubmitting ? 'Verifying…' : 'Start Interview'}
      </button>
    </form>
  );
}
