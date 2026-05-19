import { useEffect } from 'react';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';
import { TranscriptPanel } from './TranscriptPanel';

export function VoiceAgentPanel({
  question,
  onSubmit,
}: {
  question: string;
  onSubmit: (transcript: string) => Promise<void>;
}) {
  const voice = useVoiceAgent({
    question,
    onSubmit: (transcript) => {
      void onSubmit(transcript);
    },
  });

  useEffect(() => {
    voice.speakQuestion();
  }, [question]);

  return (
    <div className="space-y-4 rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={voice.speakQuestion}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white"
        >
          {voice.isSpeaking ? 'Speaking…' : 'Replay Question'}
        </button>
        <button
          type="button"
          onClick={voice.startListening}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white"
        >
          {voice.isListening ? 'Listening…' : 'Start Speaking'}
        </button>
        <button
          type="button"
          onClick={voice.stopListening}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white"
        >
          Stop
        </button>
      </div>

      {!voice.speechRecognitionSupported ? (
        <p className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Speech recognition is unavailable in this browser. Use the text field below.
        </p>
      ) : null}

      <TranscriptPanel transcript={voice.transcript} onChange={voice.setTranscript} />

      <button
        type="button"
        onClick={voice.submitAnswer}
        className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950"
      >
        Submit Answer
      </button>
    </div>
  );
}
