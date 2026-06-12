import { useState } from 'react';
import { Stepper, type StepName } from './components/Stepper';
import { Briefing } from './screens/Briefing';
import { Intro } from './screens/Intro';
import { MicCheck } from './screens/MicCheck';
import { ReportView } from './screens/ReportView';
import { Room } from './screens/Room';
import { Start } from './screens/Start';
import type { Session } from './lib/types';

type Screen = 'start' | 'briefing' | 'micCheck' | 'intro' | 'room' | 'report';

const STEP_FOR_SCREEN: Record<Screen, StepName> = {
  start: 'Setup',
  briefing: 'Briefing',
  micCheck: 'Mic check',
  intro: 'Meet',
  room: 'Interview',
  report: 'Report',
};

export function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [session, setSession] = useState<Session | null>(null);

  function restart() {
    setSession(null);
    setScreen('start');
  }


  return (
    <div className="print-shell mx-auto max-w-3xl px-5 pt-8 pb-16">
      <header className="mb-6 flex items-baseline gap-3">
        <h1 className="text-lg font-bold tracking-tight">Pathwise Mock Interview</h1>
        <span className="no-print text-sm text-ink-muted">practice out loud, get honest feedback</span>
      </header>

      <Stepper current={STEP_FOR_SCREEN[screen]} />

      {screen === 'start' && (
        <Start
          onCreated={(s) => {
            setSession(s);
            setScreen('briefing');
          }}
        />
      )}
      {screen === 'briefing' && session && (
        <Briefing session={session} onBack={restart} onContinue={() => setScreen('micCheck')} />
      )}
      {screen === 'micCheck' && (
        <MicCheck onBack={() => setScreen('briefing')} onContinue={() => setScreen('intro')} />
      )}
      {screen === 'intro' && session && (
        <Intro session={session} onBack={() => setScreen('micCheck')} onBegin={() => setScreen('room')} />
      )}
      {screen === 'room' && session && <Room session={session} onFinished={() => setScreen('report')} />}
      {screen === 'report' && session && <ReportView session={session} onRestart={restart} />}
    </div>
  );
}
