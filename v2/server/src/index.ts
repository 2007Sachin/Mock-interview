import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { sessionsRouter } from './routes/sessions.js';
import { createSessionStore } from './store/index.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', sessionsRouter(createSessionStore()));

app.listen(config.port, () => {
  console.log(`mock-interview v2 server listening on http://localhost:${config.port}`);
});
