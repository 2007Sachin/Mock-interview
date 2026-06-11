import { useState } from 'react';
import { Room } from './screens/Room';
import { Start } from './screens/Start';
import type { Session } from './lib/types';

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  return (
    <div className="shell">
      <header className="brand">
        <h1>Pathwise Mock Interview</h1>
        <span>practice out loud, get honest feedback</span>
      </header>
      {session ? <Room session={session} /> : <Start onCreated={setSession} />}
    </div>
  );
}
