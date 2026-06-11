import { useQuery } from '@tanstack/react-query';
import { getInterviewReport, getInterviewSession } from '@/lib/mockInterviewApi';

/** Safe session context (role, stages, question count). */
export function useInterviewContext(sessionId: string, sessionToken: string | null) {
  return useQuery({
    queryKey: ['interview-session', sessionId, 'context'],
    queryFn: () => getInterviewSession(sessionId, sessionToken as string),
    enabled: Boolean(sessionId && sessionToken),
  });
}

/**
 * Persisted final report. Only the report page needs this — keep it out of
 * the briefing/room screens, where it would 404 (and retry) on every visit.
 */
export function useInterviewReportQuery(sessionId: string, sessionToken: string | null) {
  return useQuery({
    queryKey: ['interview-session', sessionId, 'report'],
    queryFn: () => getInterviewReport(sessionId, sessionToken as string),
    enabled: Boolean(sessionId && sessionToken),
  });
}
