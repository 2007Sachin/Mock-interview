import { useLocation, useParams } from 'react-router-dom';
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
        <p className="text-slate-200">Loading interview report…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <ReportSummary report={resolvedReport} />
    </div>
  );
}
