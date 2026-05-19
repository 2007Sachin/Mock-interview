import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createSessionStore } from './db/store.js';
import { createInterviewSessionRouter } from './routes/interviewSessions.js';
import { CallbackService } from './services/callbackService.js';
import { QuestionService } from './services/questionService.js';
import { ScoringService } from './services/scoringService.js';
import { SessionService } from './services/sessionService.js';
import { TokenService } from './services/tokenService.js';

const port = Number(process.env.MOCK_INTERVIEW_SERVICE_PORT ?? 4174);
const publicUrl = process.env.MOCK_INTERVIEW_PUBLIC_URL ?? 'http://localhost:5174';
const callbackSecret = process.env.MOCK_INTERVIEW_CALLBACK_SECRET ?? 'dev-callback-secret';
const storePath = process.env.MOCK_INTERVIEW_STORE_PATH ?? '.data/mock-interview-store.json';
const databaseUrl = process.env.DATABASE_URL;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const store = createSessionStore({
  databaseUrl,
  filePath: storePath,
});
const tokenService = new TokenService();
const questionService = new QuestionService();
const scoringService = new ScoringService();
const callbackService = new CallbackService(callbackSecret);
const sessionService = new SessionService(
  store,
  tokenService,
  questionService,
  scoringService,
  callbackService,
  publicUrl,
);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'pathwisse-mockinterview',
    port,
    storageMode: databaseUrl ? 'postgres' : 'file-dev-fallback',
  });
});

app.use(createInterviewSessionRouter(sessionService));

app.listen(port, '0.0.0.0', () => {
  console.log(`pathwisse-mockinterview server listening on ${port}`);
});
