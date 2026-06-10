import { Navigate, Route, Routes } from 'react-router-dom';
import { AccessCodePage } from '@/pages/AccessCodePage';
import { InterviewBriefing } from '@/pages/InterviewBriefing';
import { InterviewReport } from '@/pages/InterviewReport';
import { InterviewRoom } from '@/pages/InterviewRoom';
import { StartPage } from '@/pages/StartPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/start" replace />} />
      <Route path="/start" element={<StartPage />} />
      <Route path="/interview/:sessionId" element={<AccessCodePage />} />
      <Route path="/interview/:sessionId/briefing" element={<InterviewBriefing />} />
      <Route path="/interview/:sessionId/room" element={<InterviewRoom />} />
      <Route path="/interview/:sessionId/report" element={<InterviewReport />} />
    </Routes>
  );
}
