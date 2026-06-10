import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InterviewOnboarding } from '@/components/InterviewOnboarding';
import { PipecatVoicePanel } from '@/components/PipecatVoicePanel';
import { VoiceAgentPanel } from '@/components/VoiceAgentPanel';
import { ErrorNotice, QuestionProgress } from '@/components/VoiceCallUI';
import { env } from '@/lib/env';
import { completeInterview, getNextQuestion, submitInterviewAnswer } from '@/lib/mockInterviewApi';
import { formatSessionStorageKey } from '@/lib/signature';
import { useInterviewSession } from '@/hooks/useInterviewSession';
import { INTERVIEW_STAGES } from '@/lib/stageEngine';

function RoomHeader({ roleTitle, company }: { roleTitle: string | undefined; company: string | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-sm uppercase tracking-[0.4em] text-accent">Live Mock Interview</p>
      <h1 className="text-2xl font-bold text-ink">{roleTitle ?? 'Loading…'}</h1>
      {company && <p className="text-sm text-ink-secondary">{company}</p>}
    </div>
  );
}

export function InterviewRoom() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const sessionToken = sessionStorage.getItem(formatSessionStorageKey(sessionId));
  const { context } = useInterviewSession(sessionId, sessionToken);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [stageAnswers, setStageAnswers] = useState<Record<string, string[]>>({});
  const [roomError, setRoomError] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isEndingInterview, setIsEndingInterview] = useState(false);
  const latestQuestionRequestRef = useRef(0);

  const currentStage = useMemo(
    () => context.data?.stages[currentStageIndex] ?? INTERVIEW_STAGES[currentStageIndex]?.id ?? 'introduction',
    [context.data?.stages, currentStageIndex],
  );

  // Question total comes from the brief's questionBank when one exists for the
  // session; otherwise fall back to the stage-engine question counts.
  const totalQuestions = useMemo(() => {
    if (context.data?.totalQuestions) {
      return context.data.totalQuestions;
    }

    const stages = context.data?.stages ?? [];
    const total = stages.reduce((sum, stageId) => {
      const stage = INTERVIEW_STAGES.find((item) => item.id === stageId);
      return sum + (stage?.questionCount ?? 0);
    }, 0);
    return total || 8;
  }, [context.data?.totalQuestions, context.data?.stages]);

  const currentQuestionNumber = useMemo(
    () => Object.values(stageAnswers).reduce((sum, answers) => sum + answers.length, 0) + 1,
    [stageAnswers],
  );

  useEffect(() => {
    if (!onboardingComplete || !sessionId || !sessionToken || !currentStage) return;

    const requestId = latestQuestionRequestRef.current + 1;
    latestQuestionRequestRef.current = requestId;
    let cancelled = false;
    setRoomError('');

    const requestedAt = performance.now();
    void getNextQuestion(sessionId, sessionToken, currentStage, stageAnswers[currentStage] ?? [])
      .then((result) => {
        if (cancelled || latestQuestionRequestRef.current !== requestId) return;
        console.info(`[voice-timing] question:fetch: ${Math.round(performance.now() - requestedAt)}ms`);
        setCurrentQuestion(result.question);
      })
      .catch((error) => {
        if (cancelled || latestQuestionRequestRef.current !== requestId) return;
        console.error('Failed to load the next interview question.', error);
        setRoomError('Unable to load the next question right now. Please try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [onboardingComplete, sessionId, sessionToken, currentStage, stageAnswers]);

  const handleSubmitAnswer = async (transcript: string) => {
    if (!sessionToken || isSubmittingAnswer) return;
    if (!currentQuestion) {
      setRoomError('Wait for the next question before submitting a response.');
      throw new Error('No interview question is loaded yet.');
    }

    setRoomError('');
    setIsSubmittingAnswer(true);

    try {
      await submitInterviewAnswer(sessionId, sessionToken, {
        stage: currentStage,
        question: currentQuestion,
        answerTranscript: transcript,
        audioUrl: null,
      });

      const nextAnswers = [...(stageAnswers[currentStage] ?? []), transcript];
      const stageDefinition = INTERVIEW_STAGES.find((stage) => stage.id === currentStage);
      const isStageComplete = Boolean(stageDefinition && nextAnswers.length >= stageDefinition.questionCount);

      setStageAnswers((previous) => ({ ...previous, [currentStage]: nextAnswers }));

      if (isStageComplete) {
        const nextStageIndex = currentStageIndex + 1;
        const nextStage = context.data?.stages[nextStageIndex];
        if (!nextStage || nextStage === 'closing_feedback') {
          await finalizeInterview();
          return;
        }
        setCurrentStageIndex(nextStageIndex);
      }
    } catch (error) {
      console.error('Failed to submit the interview answer.', error);
      setRoomError('Unable to submit your answer right now. Please try again.');
      throw error;
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const finalizeInterview = async () => {
    if (!sessionToken) return;
    const report = await completeInterview(sessionId, sessionToken);
    navigate(`/interview/${sessionId}/report`, { state: { report } });
  };

  const handleEndInterview = async () => {
    if (isEndingInterview) return;
    setIsEndingInterview(true);
    try {
      await finalizeInterview();
    } catch {
      setRoomError('Unable to end the interview right now. Please try again.');
    } finally {
      setIsEndingInterview(false);
    }
  };

  if (!sessionToken) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
        <p className="text-ink-secondary">Session token missing. Return to the access-code screen.</p>
      </div>
    );
  }

  if (!onboardingComplete) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <RoomHeader roleTitle={context.data?.roleTitle} company={context.data?.company} />
        </div>
        <InterviewOnboarding onComplete={() => setOnboardingComplete(true)} />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-6 px-6 py-10">
      <RoomHeader roleTitle={context.data?.roleTitle} company={context.data?.company} />

      <QuestionProgress current={currentQuestionNumber} total={totalQuestions} />

      {roomError && <ErrorNotice>{roomError}</ErrorNotice>}

      {env.voiceAgentProvider === 'browser' ? (
        <VoiceAgentPanel
          question={currentQuestion}
          onSubmit={handleSubmitAnswer}
          onEndInterview={handleEndInterview}
          isEndingInterview={isEndingInterview}
        />
      ) : (
        <PipecatVoicePanel
          sessionId={sessionId}
          currentStage={currentStage}
          currentQuestion={currentQuestion}
          onSubmitAnswer={handleSubmitAnswer}
          onEndInterview={handleEndInterview}
          isEndingInterview={isEndingInterview}
        />
      )}
    </div>
  );
}
