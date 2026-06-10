import { Link, useNavigate, useParams } from 'react-router-dom';
import { InterviewerAvatar } from '@/components/InterviewerAvatar';
import { buttonStyles } from '@/components/VoiceCallUI';
import { INTERVIEWER_NAME, INTERVIEW_LENGTH_MINUTES } from '@/lib/interviewer';
import { formatSessionStorageKey } from '@/lib/signature';
import { countStageQuestions } from '@/lib/stageEngine';
import { useInterviewSession } from '@/hooks/useInterviewSession';

function ExpectationRow({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-edge/30 bg-surface p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-lg" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-secondary">{detail}</p>
      </div>
    </div>
  );
}

export function InterviewBriefing() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const sessionToken = sessionStorage.getItem(formatSessionStorageKey(sessionId));
  const { context } = useInterviewSession(sessionId, sessionToken);

  if (!sessionToken) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
        <p className="text-ink-secondary">
          Session token missing.{' '}
          <Link to={`/interview/${sessionId}`} className="text-accent underline underline-offset-2">
            Enter your access code
          </Link>{' '}
          to continue.
        </p>
      </div>
    );
  }

  const totalQuestions = context.data?.totalQuestions ?? countStageQuestions(context.data?.stages ?? []);
  const topic = context.data?.roleTitle ?? 'your interview topic';

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-8 px-6 py-12">
      <div className="space-y-1 text-center">
        <p className="text-sm uppercase tracking-[0.4em] text-accent">Before we begin</p>
        <h1 className="text-3xl font-bold text-ink">What to expect</h1>
        <p className="text-sm text-ink-secondary">
          {context.data ? `A mock interview on ${topic}` : 'Loading your interview details…'}
        </p>
      </div>

      <div className="flex justify-center">
        <InterviewerAvatar state="idle" name={INTERVIEWER_NAME} statusOverride="Your interviewer" />
      </div>

      <div className="space-y-3">
        <ExpectationRow
          icon="⏱"
          title={`About ${INTERVIEW_LENGTH_MINUTES} minutes`}
          detail={`${totalQuestions} questions, asked one at a time. Take the time you need on each answer.`}
        />
        <ExpectationRow
          icon="🎙"
          title="Speak naturally"
          detail={`${INTERVIEWER_NAME} asks each question out loud. Answer in your own words, then click “Done — Next question” when you're finished with an answer.`}
        />
        <ExpectationRow
          icon="📊"
          title="Scored report at the end"
          detail="You'll get an overall score with per-question feedback and concrete tips on how to improve."
        />
      </div>

      <button
        type="button"
        onClick={() => navigate(`/interview/${sessionId}/room`)}
        className={`w-full py-3.5 text-base ${buttonStyles.primary}`}
      >
        Continue
      </button>
    </div>
  );
}
