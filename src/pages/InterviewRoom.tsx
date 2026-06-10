import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InterviewOnboarding } from '@/components/InterviewOnboarding';
import { InterviewerAvatar } from '@/components/InterviewerAvatar';
import { MeetInterviewer } from '@/components/MeetInterviewer';
import { PipecatVoicePanel } from '@/components/PipecatVoicePanel';
import { VoiceAgentPanel } from '@/components/VoiceAgentPanel';
import { ErrorNotice, QuestionProgress } from '@/components/VoiceCallUI';
import { env } from '@/lib/env';
import { INTERVIEWER_NAME, buildClosingLine } from '@/lib/interviewer';
import { completeInterview, getNextQuestion, submitInterviewAnswer } from '@/lib/mockInterviewApi';
import { formatSessionStorageKey } from '@/lib/signature';
import { speakLine } from '@/lib/speakLine';
import { useInterviewSession } from '@/hooks/useInterviewSession';
import { INTERVIEW_STAGES, countStageQuestions } from '@/lib/stageEngine';

type RoomPhase = 'device-check' | 'meet' | 'live' | 'wrap-up';

const WRAP_UP_MIN_MS = 2000;

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
  const [phase, setPhase] = useState<RoomPhase>('device-check');
  const [closingLineSpeaking, setClosingLineSpeaking] = useState(false);
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
  const totalQuestions = useMemo(
    () => context.data?.totalQuestions ?? countStageQuestions(context.data?.stages ?? []),
    [context.data?.totalQuestions, context.data?.stages],
  );

  const currentQuestionNumber = useMemo(
    () => Object.values(stageAnswers).reduce((sum, answers) => sum + answers.length, 0) + 1,
    [stageAnswers],
  );

  // Prefetch starts during the "meet" step so the first question is ready the
  // moment the student clicks Start interview.
  const shouldLoadQuestions = phase === 'meet' || phase === 'live';

  useEffect(() => {
    if (!shouldLoadQuestions || !sessionId || !sessionToken || !currentStage) return;

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
  }, [shouldLoadQuestions, sessionId, sessionToken, currentStage, stageAnswers]);

  const finalizeInterview = async () => {
    if (!sessionToken) return;
    setPhase('wrap-up');

    // Report generation starts immediately; the closing line plays
    // concurrently and never delays it.
    const reportPromise = completeInterview(sessionId, sessionToken);
    setClosingLineSpeaking(true);
    void speakLine(buildClosingLine()).finally(() => setClosingLineSpeaking(false));
    const minimumTransition = new Promise((resolve) => setTimeout(resolve, WRAP_UP_MIN_MS));

    try {
      const [report] = await Promise.all([reportPromise, minimumTransition]);
      navigate(`/interview/${sessionId}/report`, { state: { report } });
    } catch (error) {
      setPhase('live');
      throw error;
    }
  };

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

  const handleEndInterview = async () => {
    if (isEndingInterview || phase === 'wrap-up') return;
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

  if (phase === 'device-check') {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <RoomHeader roleTitle={context.data?.roleTitle} company={context.data?.company} />
        </div>
        <InterviewOnboarding onComplete={() => setPhase('meet')} />
      </div>
    );
  }

  if (phase === 'meet') {
    return (
      <div className="mx-auto min-h-screen max-w-3xl px-6 py-10">
        <RoomHeader roleTitle={context.data?.roleTitle} company={context.data?.company} />
        <MeetInterviewer topic={context.data?.roleTitle ?? ''} onStart={() => setPhase('live')} />
      </div>
    );
  }

  if (phase === 'wrap-up') {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 px-6 text-center">
        <InterviewerAvatar
          state={closingLineSpeaking ? 'speaking' : 'thinking'}
          name={INTERVIEWER_NAME}
          size="lg"
          statusOverride={closingLineSpeaking ? undefined : 'Preparing your report…'}
        />
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-ink">That's a wrap!</h2>
          <p className="text-sm leading-relaxed text-ink-secondary">
            {INTERVIEWER_NAME} is scoring your answers. Your report will open automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-6 px-6 pb-28 pt-10">
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
