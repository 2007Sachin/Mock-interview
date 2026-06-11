import { useEffect, useState } from 'react';
import { Orb } from '../components/Orb';
import { INTERVIEWER_NAME, introLine } from '../lib/interviewer';
import { speak } from '../lib/tts';
import type { Session } from '../lib/types';

export function Intro({ session, onBegin }: { session: Session; onBegin: () => void }) {
  const [speaking, setSpeaking] = useState(true);
  const line = introLine(session.brief.title);

  useEffect(() => {
    let cancelled = false;
    void speak(line).then(() => {
      if (!cancelled) setSpeaking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [line]);

  return (
    <div className="card card-center">
      <Orb state={speaking ? 'speaking' : 'idle'} />
      <h2>Meet {INTERVIEWER_NAME}</h2>
      <p className="subtle">{line}</p>
      <button className="btn btn-primary btn-big" onClick={onBegin} disabled={speaking}>
        {speaking ? `${INTERVIEWER_NAME} is speaking…` : 'Begin interview'}
      </button>
    </div>
  );
}
