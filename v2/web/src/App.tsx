import { useState } from 'react';
import { Briefing } from './screens/Briefing';
import { Intro } from './screens/Intro';
import { MicCheck } from './screens/MicCheck';
import { Room } from './screens/Room';
import { Start } from './screens/Start';
import type { Session } from './lib/types';

type Screen = 'start' | 'briefing' | 'micCheck' | 'intro' | 'room' | 'finished';

export function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [session, setSession] = useState<Session | null>(null);

  return (
    <div className="shell">
      <header className="brand">
        <h1>Pathwise Mock Interview</h1>
        <span>practice out loud, get honest feedback</span>
      </header>

      {screen === 'start' && (
        <Start
          onCreated={(s) => {
            setSession(s);
            setScreen('briefing');
          }}
        />
      )}
      {screen === 'briefing' && session && <Briefing session={session} onContinue={() => setScreen('micCheck')} />}
      {screen === 'micCheck' && <MicCheck onContinue={() => setScreen('intro')} />}
      {screen === 'intro' && session && <Intro session={session} onBegin={() => setScreen('room')} />}
      {screen === 'room' && session && <Room session={session} onFinished={() => setScreen('finished')} />}
      {screen === 'finished' && (
        <div className="card card-center">
          <h2>Interview complete</h2>
          <p className="subtle">Nice work — your answers were recorded and transcribed.</p>
          <button className="btn btn-primary" onClick={() => { setSession(null); setScreen('start'); }}>
            Start another interview
          </button>
        </div>
      )}
    </div>
  );
}
