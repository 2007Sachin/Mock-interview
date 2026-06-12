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

// Catch-all so errors thrown outside route handlers (e.g. multer rejecting an
// oversized upload) still produce a JSON error instead of an HTML stack page.
app.use(((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err instanceof Error ? err.message : 'Request failed.' });
}) as express.ErrorRequestHandler);

app.listen(config.port, () => {
  console.log(`mock-interview v2 server listening on http://localhost:${config.port}`);
});
