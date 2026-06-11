import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import multer from 'multer';
import { generateBrief } from '../services/brief.js';
import { GroqError, transcribe } from '../services/groq.js';
import { extractPdfText } from '../services/pdf.js';
import type { SessionStore } from '../store/SessionStore.js';
import type { Mode, Session } from '../types.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const MODES: Mode[] = ['resume', 'capstone', 'skill'];

export function sessionsRouter(store: SessionStore): Router {
  const router = Router();

  // Create a session: mode + (skill name | uploaded PDF), generate the brief.
  router.post('/session', upload.single('file'), async (req, res) => {
    try {
      const mode = req.body.mode as Mode;
      if (!MODES.includes(mode)) {
        return res.status(400).json({ error: `mode must be one of: ${MODES.join(', ')}` });
      }

      let input: string;
      if (mode === 'skill') {
        const skill = typeof req.body.skill === 'string' ? req.body.skill.trim() : '';
        if (!skill) return res.status(400).json({ error: 'skill is required for skill mode' });
        input = skill;
      } else {
        if (!req.file) return res.status(400).json({ error: 'a PDF file is required for this mode' });
        input = await extractPdfText(req.file.buffer);
      }

      const brief = await generateBrief(mode, input);
      // Optional shorter interview (handy for quick local verification).
      const requested = Number.parseInt(String(req.body.questionCount ?? ''), 10);
      if (Number.isInteger(requested) && requested >= 1 && requested < brief.questionBank.length) {
        brief.questionBank = brief.questionBank.slice(0, requested);
      }
      const session: Session = {
        id: randomUUID(),
        mode,
        createdAt: new Date().toISOString(),
        brief,
        currentQuestion: 0,
        turns: [],
        status: 'active',
      };
      await store.save(session);
      return res.status(201).json(session);
    } catch (err) {
      return handleError(res, err, 'Could not create the interview. Please try again.');
    }
  });

  router.get('/session/:id', async (req, res) => {
    const session = await store.get(req.params.id ?? '').catch(() => null);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json(session);
  });

  // Submit one answer (a recorded audio clip) for the current question.
  router.post('/session/:id/answer', upload.single('audio'), async (req, res) => {
    try {
      const session = await store.get(req.params.id ?? '').catch(() => null);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'active') {
        return res.status(409).json({ error: 'This interview has already ended.' });
      }
      if (!req.file) return res.status(400).json({ error: 'an audio file is required' });

      const transcript = await transcribe(req.file.buffer, req.file.mimetype || 'audio/webm');

      const question = session.brief.questionBank[session.currentQuestion];
      if (question === undefined) {
        return res.status(409).json({ error: 'No question is pending for this session.' });
      }
      session.turns.push({ question, answer: transcript, answeredVia: 'voice' });
      session.currentQuestion += 1;

      const nextQuestion = session.brief.questionBank[session.currentQuestion];
      if (nextQuestion === undefined) session.status = 'ended';
      await store.save(session);

      return res.json({
        transcript,
        done: nextQuestion === undefined,
        nextQuestion: nextQuestion ?? null,
        index: session.currentQuestion,
        total: session.brief.questionBank.length,
      });
    } catch (err) {
      return handleError(res, err, 'Could not process your answer. Please try again.');
    }
  });

  return router;
}

function handleError(res: Response, err: unknown, friendly: string) {
  console.error(err);
  if (err instanceof GroqError) {
    return res.status(502).json({ error: friendly, detail: 'The AI service is temporarily unavailable.' });
  }
  const message = err instanceof Error ? err.message : friendly;
  return res.status(500).json({ error: friendly, detail: message });
}
