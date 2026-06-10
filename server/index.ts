import { existsSync } from 'fs';
import { join, resolve } from 'path';
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createSessionStore } from './db/store.js';
import { createInterviewBriefRouter } from './routes/interviewBriefs.js';
import { createInterviewSessionRouter } from './routes/interviewSessions.js';
import { CallbackService } from './services/callbackService.js';
import { InterviewBriefService } from './services/interviewBriefService.js';
import { GroqBriefService } from './services/groqBriefService.js';
import { GroqInterviewService } from './services/groqInterviewService.js';
import { QuestionService } from './services/questionService.js';
import { ScoringService } from './services/scoringService.js';
import { SessionService } from './services/sessionService.js';
import { TokenService } from './services/tokenService.js';

const port = Number(process.env.PORT ?? process.env.MOCK_INTERVIEW_SERVICE_PORT ?? 4174);
const publicUrl = process.env.MOCK_INTERVIEW_PUBLIC_URL ?? 'http://localhost:5174';
const callbackSecret = process.env.MOCK_INTERVIEW_CALLBACK_SECRET ?? 'dev-callback-secret';
const storePath = process.env.MOCK_INTERVIEW_STORE_PATH ?? '.data/mock-interview-store.json';

const store = createSessionStore({
  storageBackend: process.env.STORAGE_BACKEND,
  databaseUrl: process.env.DATABASE_URL,
  supabaseDatabaseUrl: process.env.SUPABASE_DATABASE_URL,
  filePath: storePath,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const tokenService = new TokenService();
const questionService = new QuestionService();
const scoringService = new ScoringService();
const groqInterviewService = new GroqInterviewService();
const callbackService = new CallbackService(callbackSecret);
const sessionService = new SessionService(
  store,
  tokenService,
  questionService,
  scoringService,
  callbackService,
  publicUrl,
  groqInterviewService,
);
const groqBriefService = new GroqBriefService();
const interviewBriefService = new InterviewBriefService(store, tokenService, groqBriefService);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'pathwisse-mockinterview',
    port,
    storageMode: process.env.STORAGE_BACKEND ?? (process.env.DATABASE_URL ? 'postgres' : 'file-dev-fallback'),
  });
});

app.use(createInterviewSessionRouter(sessionService));
app.use(createInterviewBriefRouter(interviewBriefService));

const clientDistPath = resolve(process.cwd(), 'dist');
const indexHtmlPath = join(clientDistPath, 'index.html');

if (existsSync(indexHtmlPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(indexHtmlPath);
  });
} else {
  console.warn('[pathwisse-mockinterview] React build output not found. Frontend routes will not be served.');
}

app.listen(port, '0.0.0.0', () => {
  console.log(`pathwisse-mockinterview server listening on ${port}`);
});
