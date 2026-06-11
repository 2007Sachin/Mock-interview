import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InterviewerAvatar } from '@/components/InterviewerAvatar';
import { ReportSummary } from '@/components/ReportSummary';
import { buttonStyles } from '@/components/VoiceCallUI';
import { INTERVIEWER_NAME } from '@/lib/interviewer';
import { retryInterviewCompletion, takePendingReport } from '@/lib/mockInterviewApi';
import { formatSessionStorageKey } from '@/lib/signature';
import { useInterviewReportQuery } from '@/hooks/useInterviewSession';
import { InterviewReport as InterviewReportType } from '@/types/interview';

export function InterviewReport() {
  const { sessionId = '' } = useParams();
  const sessionToken = sessionStorage.getItem(formatSessionStorageKey(sessionId));
  // Report generation kicked off by the wrap-up screen, still in flight.
  const [pendingReport, setPendingReport] = useState<InterviewReportType | null>(null);
  const [pendingFailed, setPendingFailed] = useState(false);
  const [isPending, setIsPending] = useState(() => takePendingReport(sessionId) !== null);
  const [isRetrying, setIsRetrying] = useState(false);
  // Fallback for direct visits / refreshes: fetch the persisted report. The
  // query stays disabled while the handed-off promise settles (or when it
  // already produced a report or a failure the retry button handles).
  const fallbackEnabled = !isPending && !pendingFailed && !pendingReport;
  const report = useInterviewReportQuery(sessionId, fallbackEnabled ? sessionToken : null);

  useEffect(() => {
    const pending = takePendingReport(sessionId);
    if (!pending) return;

    let cancelled = false;
    pending
      .then((result) => {
        if (!cancelled) setPendingReport(result);
      })
      .catch(() => {
        if (!cancelled) setPendingFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const retryGeneration = useCallback(async () => {
    if (!sessionToken || isRetrying) return;
    setIsRetrying(true);
    try {
      setPendingReport(await retryInterviewCompletion(sessionId, sessionToken));
      setPendingFailed(false);
    } catch {
      // Stay on the error state; the student can retry again.
    } finally {
      setIsRetrying(false);
    }
  }, [sessionId, sessionToken, isRetrying]);

  const resolvedReport = pendingReport ?? report.data ?? null;

  if (!resolvedReport && (isPending || report.isLoading)) {
    return (
      <div className="page-enter mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 px-6 text-center">
        <InterviewerAvatar state="thinking" name={INTERVIEWER_NAME} size="lg" statusOverride="Scoring your answers…" />
        <div className="stagger-children space-y-2">
          <h2 className="text-2xl font-bold text-ink">Building your report</h2>
          <p className="text-sm leading-relaxed text-ink-secondary">
            {INTERVIEWER_NAME} is reviewing every answer. This usually takes a few seconds.
          </p>
        </div>
      </div>
    );
  }

  // Only shown when a completion this page is responsible for failed. Direct
  // visits without a persisted report keep the passive loading line below —
  // offering "generate" there could complete an unfinished interview.
  if (!resolvedReport && pendingFailed) {
    return (
      <div className="page-enter mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
        <InterviewerAvatar state="idle" name={INTERVIEWER_NAME} statusOverride="Report not ready" />
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-ink">Your report isn't ready yet</h2>
          <p className="text-sm leading-relaxed text-ink-secondary">
            Something interrupted the scoring. Your answers are saved — try generating the report again.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void retryGeneration();
          }}
          disabled={isRetrying || !sessionToken}
          className={buttonStyles.primary}
        >
          {isRetrying ? 'Generating…' : 'Generate report'}
        </button>
      </div>
    );
  }

  if (!resolvedReport) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl items-center px-6">
        <p className="text-ink-secondary">Loading interview report…</p>
      </div>
    );
  }

  return (
    <div className="page-enter stagger-children mx-auto min-h-screen max-w-4xl space-y-6 px-6 py-12">
      <ReportSummary report={resolvedReport} />
      <div className="flex justify-center">
        <Link to="/start" className={buttonStyles.primary}>
          Practice another interview
        </Link>
      </div>
    </div>
  );
}
