import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InterviewQuestion } from '@/components/InterviewQuestion';
import { PipecatVoicePanel } from '@/components/PipecatVoicePanel';
import { StageProgress } from '@/components/StageProgress';
import { VoiceAgentPanel } from '@/components/VoiceAgentPanel';
import { env } from '@/lib/env';
import { completeInterview, getNextQuestion, submitInterviewAnswer } from '@/lib/mockInterviewApi';
import { formatSessionStorageKey } from '@/lib/signature';
import { useInterviewSession } from '@/hooks/useInterviewSession';
import { INTERVIEW_STAGES } from '@/lib/stageEngine';

export function InterviewRoom() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const sessionToken = sessionStorage.getItem(formatSessionStorageKey(sessionId));
  const { context } = useInterviewSession(sessionId, sessionToken);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(1);
  const [stageAnswers, setStageAnswers] = useState<Record<string, string[]>>({});
  const [roomError, setRoomError] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const latestQuestionRequestRef = useRef(0);

  const currentStage = useMemo(
    () => context.data?.stages[currentStageIndex] ?? INTERVIEW_STAGES[currentStageIndex]?.id ?? 'introduction',
    [context.data?.stages, currentStageIndex],
  );

  useEffect(() => {
    if (!sessionId || !sessionToken || !currentStage) return;

    const requestId = latestQuestionRequestRef.current + 1;
    latestQuestionRequestRef.current = requestId;
    let cancelled = false;
    setRoomError('');

    void getNextQuestion(sessionId, sessionToken, currentStage, stageAnswers[currentStage] ?? [])
      .then((result) => {
        if (cancelled || latestQuestionRequestRef.current !== requestId) return;

        setCurrentQuestion(result.question);
        setQuestionNumber(result.questionNumber);
        setTotalQuestions(result.totalQuestionsInStage);
      })
      .catch((error) => {
        if (cancelled || latestQuestionRequestRef.current !== requestId) return;

        console.error('Failed to load the next interview question.', error);
        setRoomError('Unable to load the next question right now. Please try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionToken, currentStage, stageAnswers]);

  const handleSubmitAnswer = async (transcript: string) => {
    if (!sessionToken || isSubmittingAnswer) return;
    if (!currentQuestion) {
      const error = new Error('No interview question is loaded yet.');
      setRoomError('Wait for the next question before submitting a response.');
      throw error;
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

      if (isStageComplete) {
        const nextStageIndex = currentStageIndex + 1;
        const nextStage = context.data?.stages[nextStageIndex];
        if (!nextStage || nextStage === 'closing_feedback') {
          const report = await completeInterview(sessionId, sessionToken);
          navigate(`/interview/${sessionId}/report`, { state: { report } });
          return;
        }

        setStageAnswers((previous) => ({
          ...previous,
          [currentStage]: nextAnswers,
        }));
        setCurrentStageIndex(nextStageIndex);
        return;
      }

      setStageAnswers((previous) => ({
        ...previous,
        [currentStage]: nextAnswers,
      }));
    } catch (error) {
      console.error('Failed to submit the interview answer.', error);
      setRoomError('Unable to submit your answer right now. Please try again.');
      throw error;
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  if (!sessionToken) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
        <p className="text-slate-200">Session token missing. Return to the access-code screen.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl space-y-6 px-6 py-10">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.4em] text-emerald-200">Live Mock Interview</p>
        <h1 className="text-4xl font-bold text-white">
          {context.data?.roleTitle ?? 'Loading role…'}
        </h1>
        <p className="text-slate-300">{context.data?.company ?? 'Preparing session context…'}</p>
      </div>

      <StageProgress currentStage={currentStage} />

      <InterviewQuestion
        stage={currentStage}
        question={currentQuestion}
        questionNumber={questionNumber}
        totalQuestionsInStage={totalQuestions}
      />

      {roomError ? (
        <p className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {roomError}
        </p>
      ) : null}

      {env.voiceAgentProvider === 'browser' ? (
        <>
          <p className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Browser fallback mode is enabled. Production mode uses Pipecat + Mistral + Kokoro.
          </p>
          <VoiceAgentPanel question={currentQuestion} onSubmit={handleSubmitAnswer} />
        </>
      ) : (
        <PipecatVoicePanel
          sessionId={sessionId}
          currentStage={currentStage}
          currentQuestion={currentQuestion}
          onManualFallbackSubmit={handleSubmitAnswer}
        />
      )}
    </div>
  );
}
