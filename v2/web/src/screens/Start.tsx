import { useState, type FormEvent } from 'react';
import { Button, Card } from '../components/ui';
import { createSession } from '../lib/api';
import { preloadTts } from '../lib/tts';
import type { Mode, Session } from '../lib/types';

const inputClass =
  'mt-1.5 block w-full rounded-lg border border-edge bg-surface px-3 py-2.5 text-ink';

export function Start({ onCreated }: { onCreated: (session: Session) => void }) {
  const [mode, setMode] = useState<Mode>('skill');
  const [skill, setSkill] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // Kick off the TTS model download while the brief is being generated.
    void preloadTts();
    try {
      const session = await createSession({
        mode,
        skill: mode === 'skill' ? skill : undefined,
        file: mode !== 'skill' ? (file ?? undefined) : undefined,
        questionCount,
      });
      onCreated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-2xl font-bold tracking-tight">Start a mock interview</h2>
      <p className="mt-1 mb-6 text-ink-secondary">
        Pick what you want to be interviewed on. You will answer out loud.
      </p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-semibold">
          Interview type
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="skill">A skill or topic</option>
            <option value="resume">My resume (PDF)</option>
            <option value="capstone">My capstone project report (PDF)</option>
          </select>
        </label>

        {mode === 'skill' ? (
          <label className="block text-sm font-semibold">
            Skill or topic
            <input
              className={inputClass}
              type="text"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="e.g. React, SQL, data structures"
              required
            />
          </label>
        ) : (
          <label className="block text-sm font-semibold">
            Upload PDF
            <input
              className="mt-1.5 block text-sm"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
        )}

        <label className="block text-sm font-semibold">
          Number of questions
          <select
            className={inputClass}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          >
            {[2, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end border-t border-edge pt-5">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Preparing your interview…' : 'Start interview →'}
          </Button>
        </div>
      </form>
      {error && (
        <div className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}
    </Card>
  );
}
