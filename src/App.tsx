import { Navigate, Route, Routes } from 'react-router-dom';
import { AccessCodePage } from '@/pages/AccessCodePage';
import { InterviewReport } from '@/pages/InterviewReport';
import { InterviewRoom } from '@/pages/InterviewRoom';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/interview/demo-session" replace />} />
      <Route path="/interview/:sessionId" element={<AccessCodePage />} />
      <Route path="/interview/:sessionId/room" element={<InterviewRoom />} />
      <Route path="/interview/:sessionId/report" element={<InterviewReport />} />
    </Routes>
  );
}
