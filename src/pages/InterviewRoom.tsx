import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InterviewQuestion } from '@/components/InterviewQuestion';
import { StageProgress } from '@/components/StageProgress';
import { VoiceAgentPanel } from '@/components/VoiceAgentPanel';
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

  const currentStage = useMemo(
    () => context.data?.stages[currentStageIndex] ?? INTERVIEW_STAGES[currentStageIndex]?.id ?? 'introduction',
    [context.data?.stages, currentStageIndex],
  );

  useEffect(() => {
    if (!sessionId || !sessionToken || !currentStage) return;

    void getNextQuestion(sessionId, sessionToken, currentStage, stageAnswers[currentStage] ?? [])
      .then((result) => {
        setCurrentQuestion(result.question);
        setQuestionNumber(result.questionNumber);
        setTotalQuestions(result.totalQuestionsInStage);
      });
  }, [sessionId, sessionToken, currentStage, stageAnswers]);

  const handleSubmitAnswer = async (transcript: string) => {
    if (!sessionToken || !currentQuestion) return;

    await submitInterviewAnswer(sessionId, sessionToken, {
      stage: currentStage,
      question: currentQuestion,
      answerTranscript: transcript,
      audioUrl: null,
    });

    const nextAnswers = [...(stageAnswers[currentStage] ?? []), transcript];
    setStageAnswers((previous) => ({
      ...previous,
      [currentStage]: nextAnswers,
    }));

    const stageDefinition = INTERVIEW_STAGES.find((stage) => stage.id === currentStage);
    if (stageDefinition && nextAnswers.length >= stageDefinition.questionCount) {
      const nextStageIndex = currentStageIndex + 1;
      const nextStage = context.data?.stages[nextStageIndex];
      if (!nextStage || nextStage === 'closing_feedback') {
        const report = await completeInterview(sessionId, sessionToken);
        navigate(`/interview/${sessionId}/report`, { state: { report } });
        return;
      }
      setCurrentStageIndex(nextStageIndex);
      return;
    }

    const nextQuestion = await getNextQuestion(sessionId, sessionToken, currentStage, nextAnswers);
    setCurrentQuestion(nextQuestion.question);
    setQuestionNumber(nextQuestion.questionNumber);
    setTotalQuestions(nextQuestion.totalQuestionsInStage);
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

      <VoiceAgentPanel question={currentQuestion} onSubmit={handleSubmitAnswer} />
    </div>
  );
}
