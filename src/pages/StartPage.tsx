import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buttonStyles } from '@/components/VoiceCallUI';
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
      className={`btn-press rounded-[2rem] border p-6 text-left ${
        selected
          ? 'border-accent bg-accent/10 ring-1 ring-accent/40'
          : 'border-edge/30 bg-surface hover:border-edge/50 hover:bg-surface-raised/60'
      }`}
    >
      <span className={selected ? 'text-accent-strong' : 'text-ink-secondary'}>{mode.icon}</span>
      <p className="mt-3 font-semibold text-ink">{mode.label}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{mode.description}</p>
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
      className={`cursor-pointer rounded-[2rem] border-2 border-dashed p-10 text-center transition-colors ${
        dragging
          ? 'border-accent bg-accent/10'
          : file
            ? 'border-accent/60 bg-accent/5'
            : 'border-edge/40 bg-surface hover:border-edge/60'
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
          <p className="font-medium text-accent-strong">{file.name}</p>
          <p className="text-xs text-ink-secondary">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
        </div>
      ) : (
        <div className="space-y-3">
          <span className="inline-block text-ink-secondary">
            <IconUpload />
          </span>
          <div className="space-y-1">
            <p className="font-medium text-ink">
              {dragging ? 'Drop your PDF here' : 'Drag your project PDF here'}
            </p>
            <p className="text-sm text-ink-secondary">or click to browse — PDF up to 10 MB</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const inputStyles =
  'w-full rounded-2xl border border-edge/40 bg-canvas px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent/50';

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
    <div className="page-enter mx-auto min-h-screen max-w-2xl px-6 py-16">
      {/* Header */}
      <div className="stagger-children mb-10 space-y-3">
        <p className="text-sm uppercase tracking-[0.4em] text-accent">Pathwisse</p>
        <h1 className="text-5xl font-bold text-ink">Mock Interview</h1>
        <p className="leading-relaxed text-ink-secondary">
          Choose your interview type, fill in the details, and start a live spoken interview.
        </p>
      </div>

      {/* Mode selector */}
      <div className="stagger-children mb-8 grid gap-4 sm:grid-cols-3">
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
        <div key="resume" className="qswap-enter space-y-5 rounded-[2rem] border border-edge/30 bg-surface p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Role details</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-ink-secondary">Job title *</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
                className={inputStyles}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-ink-secondary">Company</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Pathwisse"
                className={inputStyles}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-ink-secondary">Job description *</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={5}
              placeholder="Paste the job description here…"
              className={`resize-none ${inputStyles}`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-ink-secondary">Your resume *</label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={7}
              placeholder="Paste your resume text here…"
              className={`resize-none ${inputStyles}`}
            />
          </div>
        </div>
      )}

      {selectedMode === 'capstone' && (
        <div key="capstone" className="qswap-enter space-y-5 rounded-[2rem] border border-edge/30 bg-surface p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Project PDF</p>
          <p className="text-sm text-ink-secondary">
            Upload your capstone project report or README. The interviewer will ask about your design decisions,
            implementation choices, and what you'd improve.
          </p>
          <PdfDropZone file={pdfFile} onChange={setPdfFile} disabled={loading} />
        </div>
      )}

      {selectedMode === 'skill' && (
        <div key="skill" className="qswap-enter space-y-5 rounded-[2rem] border border-edge/30 bg-surface p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Skill details</p>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-ink-secondary">Skill name *</label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="e.g. React, System Design, PostgreSQL, Kubernetes…"
              className={inputStyles}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-ink-secondary">Level</label>
            <select
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
              className={inputStyles}
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
        <p className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
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
            className={`btn-press w-full rounded-[2rem] bg-accent px-6 py-4 text-base font-semibold text-accent-contrast hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40`}
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
