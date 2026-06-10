import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createInterviewBrief, verifyInterviewSession } from '@/lib/mockInterviewApi';
import { formatSessionStorageKey } from '@/lib/signature';
import type { InterviewMode, SkillLevel } from '@/types/interview';

// ---------------------------------------------------------------------------
// Icons (inline SVG, no dependency)
// ---------------------------------------------------------------------------

function IconDocument() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mode card
// ---------------------------------------------------------------------------

const MODES: { id: InterviewMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'resume',
    label: 'Resume Interview',
    description: 'Practice with a real job description and your resume. Get role-specific questions.',
    icon: <IconDocument />,
  },
  {
    id: 'capstone',
    label: 'Capstone Project',
    description: 'Upload your project PDF and be interviewed on design decisions and trade-offs.',
    icon: <IconFolder />,
  },
  {
    id: 'skill',
    label: 'Skill Assessment',
    description: 'Deep-dive into a specific skill at your level — concepts, scenarios, edge cases.',
    icon: <IconZap />,
  },
];

function ModeCard({
  mode,
  selected,
  onSelect,
}: {
  mode: (typeof MODES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[2rem] border p-6 text-left transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-400/10 ring-1 ring-emerald-400/40'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
      }`}
    >
      <span className={selected ? 'text-emerald-300' : 'text-slate-400'}>{mode.icon}</span>
      <p className={`mt-3 font-semibold ${selected ? 'text-white' : 'text-slate-200'}`}>
        {mode.label}
      </p>
      <p className="mt-1 text-sm text-slate-400 leading-relaxed">{mode.description}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PDF drop zone
// ---------------------------------------------------------------------------

function PdfDropZone({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (f: File) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped && dropped.type === 'application/pdf') {
        onChange(dropped);
      }
    },
    [onChange],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`cursor-pointer rounded-[2rem] border-2 border-dashed p-10 text-center transition-all ${
        dragging
          ? 'border-emerald-400 bg-emerald-400/10'
          : file
            ? 'border-emerald-300/60 bg-emerald-300/5'
            : 'border-white/20 bg-white/3 hover:border-white/30'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />

      {file ? (
        <div className="space-y-2">
          <p className="text-emerald-300 font-medium">{file.name}</p>
          <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
        </div>
      ) : (
        <div className="space-y-3">
          <span className="inline-block text-slate-400">
            <IconUpload />
          </span>
          <div className="space-y-1">
            <p className="text-slate-200 font-medium">
              {dragging ? 'Drop your PDF here' : 'Drag your project PDF here'}
            </p>
            <p className="text-sm text-slate-400">or click to browse — PDF up to 10 MB</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function StartPage() {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState<InterviewMode | null>(null);

  // Resume inputs
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeText, setResumeText] = useState('');

  // Capstone inputs
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Skill inputs
  const [skillName, setSkillName] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [error, setError] = useState('');

  const canSubmit = (() => {
    if (!selectedMode || loading) return false;
    if (selectedMode === 'resume') return jobTitle.trim().length > 0 && jobDescription.trim().length > 0 && resumeText.trim().length > 0;
    if (selectedMode === 'capstone') return pdfFile !== null;
    if (selectedMode === 'skill') return skillName.trim().length > 0;
    return false;
  })();

  const handleSubmit = async () => {
    if (!selectedMode || !canSubmit) return;
    setError('');
    setLoading(true);
    setLoadingLabel(selectedMode === 'capstone' ? 'Analyzing your project…' : 'Creating interview…');

    try {
      let brief;
      if (selectedMode === 'resume') {
        brief = await createInterviewBrief({
          mode: 'resume',
          jobTitle: jobTitle.trim(),
          company: company.trim() || undefined,
          jobDescription: jobDescription.trim(),
          resumeText: resumeText.trim(),
        });
      } else if (selectedMode === 'capstone') {
        brief = await createInterviewBrief({ mode: 'capstone', pdf: pdfFile! });
      } else {
        brief = await createInterviewBrief({
          mode: 'skill',
          skillName: skillName.trim(),
          level: skillLevel,
        });
      }

      setLoadingLabel('Starting session…');
      const verified = await verifyInterviewSession(brief.sessionId, brief.accessCode);
      sessionStorage.setItem(formatSessionStorageKey(brief.sessionId), verified.sessionToken);
      navigate(`/interview/${brief.sessionId}/briefing`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create interview. Please try again.');
    } finally {
      setLoading(false);
      setLoadingLabel('');
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      {/* Header */}
      <div className="mb-10 space-y-3">
        <p className="text-sm uppercase tracking-[0.4em] text-emerald-200">Pathwisse</p>
        <h1 className="text-5xl font-bold text-white">Mock Interview</h1>
        <p className="text-slate-300 leading-relaxed">
          Choose your interview type, fill in the details, and start a live spoken interview.
        </p>
      </div>

      {/* Mode selector */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {MODES.map((mode) => (
          <ModeCard
            key={mode.id}
            mode={mode}
            selected={selectedMode === mode.id}
            onSelect={() => setSelectedMode(mode.id)}
          />
        ))}
      </div>

      {/* Mode-specific inputs */}
      {selectedMode === 'resume' && (
        <div className="space-y-5 rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200">Role details</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-slate-400">Job title *</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-slate-400">Company</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Pathwisse"
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400/60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400">Job description *</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={5}
              placeholder="Paste the job description here…"
              className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400/60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400">Your resume *</label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={7}
              placeholder="Paste your resume text here…"
              className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400/60"
            />
          </div>
        </div>
      )}

      {selectedMode === 'capstone' && (
        <div className="space-y-5 rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200">Project PDF</p>
          <p className="text-sm text-slate-400">
            Upload your capstone project report or README. The interviewer will ask about your design decisions,
            implementation choices, and what you'd improve.
          </p>
          <PdfDropZone file={pdfFile} onChange={setPdfFile} disabled={loading} />
        </div>
      )}

      {selectedMode === 'skill' && (
        <div className="space-y-5 rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200">Skill details</p>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400">Skill name *</label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g. React, System Design, PostgreSQL, Kubernetes…"
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400/60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400">Level</label>
            <select
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/60"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-5 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      )}

      {/* Submit */}
      {selectedMode && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => { void handleSubmit(); }}
            disabled={!canSubmit}
            className="w-full rounded-[2rem] bg-emerald-400 px-6 py-4 text-base font-semibold text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {loadingLabel}
              </span>
            ) : (
              'Start Interview'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
