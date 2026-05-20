import { useEffect, useState } from 'react';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';

function PulseDot({ active, color }: { active: boolean; color: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full transition-all duration-300 ${
        active ? `${color} animate-pulse scale-110` : 'bg-white/20 scale-100'
      }`}
    />
  );
}

export function VoiceAgentPanel({
  question,
  onSubmit,
}: {
  question: string;
  onSubmit: (transcript: string) => Promise<void>;
}) {
  const [fallbackOpen, setFallbackOpen] = useState(false);

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
      {/* Assistant bubble */}
      <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <PulseDot active={voice.isSpeaking} color="bg-sky-400" />
          <p className="text-xs uppercase tracking-[0.3em] text-sky-300">
            {voice.isSpeaking ? 'Speaking…' : 'Assistant'}
          </p>
        </div>
        <p className="text-white text-sm leading-relaxed">{question || 'Loading question…'}</p>
        <button
          type="button"
          onClick={voice.speakQuestion}
          disabled={voice.isSpeaking}
          className="text-xs text-sky-300 underline underline-offset-2 disabled:opacity-50"
        >
          {voice.isSpeaking ? 'Speaking…' : 'Replay question'}
        </button>
      </div>

      {/* User speaking area */}
      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <PulseDot active={voice.isListening} color="bg-emerald-400" />
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
            {voice.isListening ? 'Listening…' : 'Your turn'}
          </p>
        </div>

        {voice.transcript ? (
          <p className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap min-h-[2rem]">
            {voice.transcript}
          </p>
        ) : (
          <p className="text-slate-400 text-sm italic">
            {voice.isListening ? 'Speak now…' : 'Click Start Speaking to answer.'}
          </p>
        )}

        {!voice.speechRecognitionSupported && (
          <p className="text-xs text-amber-300">
            Speech recognition is unavailable in this browser. Use the text fallback below.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={voice.startListening}
            disabled={voice.isListening}
            className="rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {voice.isListening ? 'Listening…' : 'Start Speaking'}
          </button>
          {voice.isListening && (
            <button
              type="button"
              onClick={voice.stopListening}
              className="rounded-2xl border border-white/20 px-4 py-2.5 text-sm text-white"
            >
              Stop
            </button>
          )}
          {voice.transcript && !voice.isListening && (
            <button
              type="button"
              onClick={voice.submitAnswer}
              className="rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950"
            >
              Submit answer
            </button>
          )}
        </div>
      </div>

      {/* Text fallback drawer */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/40">
        <button
          type="button"
          onClick={() => setFallbackOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-sm text-slate-400 hover:text-white"
        >
          <span>Having trouble? Use text fallback</span>
          <svg
            className={`h-4 w-4 transition-transform ${fallbackOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {fallbackOpen && (
          <div className="border-t border-white/10 p-4 space-y-3">
            <textarea
              value={voice.transcript}
              onChange={(e) => voice.setTranscript(e.target.value)}
              rows={5}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none resize-none"
              placeholder="Type your answer here if voice is unavailable."
            />
            <button
              type="button"
              onClick={voice.submitAnswer}
              className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950"
            >
              Submit Answer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
