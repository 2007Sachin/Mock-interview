import { useEffect, useRef, useState } from 'react';
import { InterviewerAvatar } from '@/components/InterviewerAvatar';
import { buttonStyles } from '@/components/VoiceCallUI';
import { INTERVIEWER_NAME, buildIntroLine } from '@/lib/interviewer';
import { speakLine, stopSpokenLine } from '@/lib/speakLine';

/**
 * "Meet your interviewer" step: the avatar introduces itself out loud once,
 * then the student starts the interview when ready.
 */
export function MeetInterviewer({ topic, onStart }: { topic: string; onStart: () => void }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasSpokenRef = useRef(false);

  useEffect(() => {
    if (hasSpokenRef.current || !topic.trim()) return;
    hasSpokenRef.current = true;

    let cancelled = false;
    setIsSpeaking(true);
    void speakLine(buildIntroLine(topic)).finally(() => {
      if (!cancelled) setIsSpeaking(false);
    });

    return () => {
      cancelled = true;
      stopSpokenLine();
    };
  }, [topic]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.4em] text-accent">Meet your interviewer</p>
        <h2 className="text-2xl font-bold text-ink">{INTERVIEWER_NAME}</h2>
      </div>

      <InterviewerAvatar
        state={isSpeaking ? 'speaking' : 'idle'}
        name={INTERVIEWER_NAME}
        size="lg"
        statusOverride={isSpeaking ? undefined : 'Ready when you are'}
      />

      <p className="max-w-md text-sm leading-relaxed text-ink-secondary">
        “{buildIntroLine(topic)}”
      </p>

      <button
        type="button"
        onClick={() => {
          stopSpokenLine();
          onStart();
        }}
        className={`w-full max-w-sm py-3.5 text-base ${buttonStyles.primary}`}
      >
        Start interview
      </button>
    </div>
  );
}
