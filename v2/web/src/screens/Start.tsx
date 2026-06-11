import { useState, type FormEvent } from 'react';
import { createSession } from '../lib/api';
import { preloadTts } from '../lib/tts';
import type { Mode, Session } from '../lib/types';

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
    <div className="card">
      <h2>Start a mock interview</h2>
      <p className="subtle">Pick what you want to be interviewed on. You will answer out loud.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          Interview type
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="skill">A skill or topic</option>
            <option value="resume">My resume (PDF)</option>
            <option value="capstone">My capstone project report (PDF)</option>
          </select>
        </label>

        {mode === 'skill' ? (
          <label className="field">
            Skill or topic
            <input
              type="text"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="e.g. React, SQL, data structures"
              required
            />
          </label>
        ) : (
          <label className="field">
            Upload PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
        )}

        <label className="field">
          Number of questions
          <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
            {[2, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </select>
        </label>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Preparing your interview…' : 'Start interview'}
        </button>
      </form>
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
