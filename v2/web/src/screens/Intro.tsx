import { useEffect, useState } from 'react';
import { Orb } from '../components/Orb';
import { Button, Card, NavBar } from '../components/ui';
import { INTERVIEWER_NAME, introLine } from '../lib/interviewer';
import { speak, stopSpeaking } from '../lib/tts';
import type { Session } from '../lib/types';

export function Intro({
  session,
  onBack,
  onBegin,
}: {
  session: Session;
  onBack: () => void;
  onBegin: () => void;
}) {
  const [speaking, setSpeaking] = useState(true);
  const line = introLine(session.brief.title);

  useEffect(() => {
    let cancelled = false;
    void speak(line).then(() => {
      if (!cancelled) setSpeaking(false);
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [line]);

  return (
    <Card className="text-center">
      <div className="mx-auto mb-4 w-fit">
        <Orb state={speaking ? 'speaking' : 'idle'} />
      </div>
      <h2 className="text-2xl font-bold tracking-tight">Meet {INTERVIEWER_NAME}</h2>
      <p className="mx-auto mt-2 max-w-xl text-ink-secondary">{line}</p>
      <NavBar onBack={onBack}>
        {/* Always enabled — clicking just cuts the intro short. */}
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            stopSpeaking();
            onBegin();
          }}
        >
          Begin interview →
        </Button>
      </NavBar>
    </Card>
  );
}
