import { useQuery } from '@tanstack/react-query';
import { getInterviewReport, getInterviewSession } from '@/lib/mockInterviewApi';

export function useInterviewSession(sessionId: string, sessionToken: string | null) {
  const context = useQuery({
    queryKey: ['interview-session', sessionId, 'context'],
    queryFn: () => getInterviewSession(sessionId, sessionToken as string),
    enabled: Boolean(sessionId && sessionToken),
  });

  const report = useQuery({
    queryKey: ['interview-session', sessionId, 'report'],
    queryFn: () => getInterviewReport(sessionId, sessionToken as string),
    enabled: Boolean(sessionId && sessionToken),
  });

  return { context, report };
}
