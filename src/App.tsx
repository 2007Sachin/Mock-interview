import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

// Each screen is its own chunk so the first paint only loads the active route.
const AccessCodePage = lazy(() => import('@/pages/AccessCodePage').then((m) => ({ default: m.AccessCodePage })));
const InterviewBriefing = lazy(() => import('@/pages/InterviewBriefing').then((m) => ({ default: m.InterviewBriefing })));
const InterviewReport = lazy(() => import('@/pages/InterviewReport').then((m) => ({ default: m.InterviewReport })));
const InterviewRoom = lazy(() => import('@/pages/InterviewRoom').then((m) => ({ default: m.InterviewRoom })));
const StartPage = lazy(() => import('@/pages/StartPage').then((m) => ({ default: m.StartPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="route-spinner" aria-label="Loading" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/start" replace />} />
        <Route path="/start" element={<StartPage />} />
        <Route path="/interview/:sessionId" element={<AccessCodePage />} />
        <Route path="/interview/:sessionId/briefing" element={<InterviewBriefing />} />
        <Route path="/interview/:sessionId/room" element={<InterviewRoom />} />
        <Route path="/interview/:sessionId/report" element={<InterviewReport />} />
      </Routes>
    </Suspense>
  );
}
