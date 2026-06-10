import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AccessCodeForm } from '@/components/AccessCodeForm';
import { verifyInterviewSession } from '@/lib/mockInterviewApi';
import { formatSessionStorageKey } from '@/lib/signature';

export function AccessCodePage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (accessCode: string) => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const result = await verifyInterviewSession(sessionId, accessCode);
      sessionStorage.setItem(formatSessionStorageKey(sessionId), result.sessionToken);
      navigate(`/interview/${sessionId}/briefing`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify access code.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <div className="mb-8 space-y-3">
        <p className="text-sm uppercase tracking-[0.4em] text-emerald-200">Pathwisse Mock Interview</p>
        <h1 className="text-5xl font-bold text-white">Enter Access Code</h1>
        <p className="text-slate-300">
          Your interview payload stays server-side. Use the access code from the LMS modal to unlock this session.
        </p>
      </div>
      <AccessCodeForm onSubmit={handleSubmit} isSubmitting={isSubmitting} errorMessage={errorMessage} />
    </div>
  );
}
