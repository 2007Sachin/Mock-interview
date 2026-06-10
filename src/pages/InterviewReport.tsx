import { Link, useLocation, useParams } from 'react-router-dom';
import { ReportSummary } from '@/components/ReportSummary';
import { formatSessionStorageKey } from '@/lib/signature';
import { useInterviewSession } from '@/hooks/useInterviewSession';
import { InterviewReport as InterviewReportType } from '@/types/interview';

export function InterviewReport() {
  const { sessionId = '' } = useParams();
  const sessionToken = sessionStorage.getItem(formatSessionStorageKey(sessionId));
  const { state } = useLocation();
  const inlineReport = (state as { report?: InterviewReportType } | null)?.report ?? null;
  const { report } = useInterviewSession(sessionId, sessionToken);
  const resolvedReport = inlineReport ?? report.data ?? null;

  if (!resolvedReport) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl items-center px-6">
        <p className="text-ink-secondary">Loading interview report…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-6 px-6 py-12">
      <ReportSummary report={resolvedReport} />
      <div className="flex justify-center">
        <Link
          to="/start"
          className="rounded-2xl bg-accent px-6 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Practice another interview
        </Link>
      </div>
    </div>
  );
}
