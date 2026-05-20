import { NextFunction, Request, Response, Router } from 'express';
import { SessionService } from '../services/sessionService.js';

type SessionWriteAuth =
  | { type: 'session'; token: string }
  | { type: 'internal' };

export function createInterviewSessionRouter(service: SessionService) {
  const router = Router();

  router.post('/api/interview-sessions', asyncHandler(async (req, res) => {
    const providedSecret = req.header('x-service-secret');
    const expectedSecret = process.env.MOCK_INTERVIEW_SERVICE_SECRET ?? 'dev-secret';
    if (!providedSecret || providedSecret !== expectedSecret) {
      return res.status(403).json({ message: 'Invalid service secret.' });
    }

    const result = await service.createSession(req.body);
    return res.json(result);
  }, (_error, res) => {
    return res.status(500).json({ message: 'Unable to create interview session.' });
  }));

  router.post('/api/interview-sessions/:sessionId/verify', asyncHandler(async (req, res) => {
      const result = await service.verifySession(getSingleParam(req.params.sessionId), req.body.accessCode);
      return res.status(result.status).json(result.body);
  }, (error, res) => {
      return res.status(404).json({ message: error instanceof Error ? error.message : 'Interview session not found.' });
  }));

  router.get('/api/interview-sessions/:sessionId', asyncHandler(async (req, res) => {
      const token = getBearerToken(req.header('authorization'));
      if (!token) return res.status(401).json({ message: 'Missing session token.' });
      return res.json(await service.getSafeContext(getSingleParam(req.params.sessionId), token));
  }, (error, res) => {
      return res.status(401).json({ message: error instanceof Error ? error.message : 'Unauthorized.' });
  }));

  router.post('/api/interview-sessions/:sessionId/voice/connect', asyncHandler(async (req, res) => {
      const token = getBearerToken(req.header('authorization'));
      if (!token) return res.status(401).json({ message: 'Missing session token.' });
      return res.json(await service.createVoiceConnectPayload(getSingleParam(req.params.sessionId), token));
  }, (error, res) => {
      return res.status(getErrorStatus(error, 500)).json({ message: getErrorMessage(error, 'Unable to create voice connect payload.') });
  }));

  router.get('/api/internal/interview-sessions/:sessionId/voice-context', asyncHandler(async (req, res) => {
      const expectedSecret = process.env.PIPECAT_CONNECT_SECRET?.trim();
      if (!expectedSecret) {
        return res.status(503).json({ message: 'PIPECAT_CONNECT_SECRET is not configured.' });
      }

      const providedSecret = req.header('x-pipecat-secret')?.trim();
      if (!providedSecret || providedSecret !== expectedSecret) {
        return res.status(403).json({ message: 'Invalid Pipecat secret.' });
      }

      return res.json(await service.getInternalVoiceContext(getSingleParam(req.params.sessionId)));
  }, (error, res) => {
      return res.status(getErrorStatus(error, 404)).json({ message: getErrorMessage(error, 'Interview voice context not found.') });
  }));

  router.post('/api/interview-sessions/:sessionId/questions/next', asyncHandler(async (req, res) => {
      const token = getBearerToken(req.header('authorization'));
      if (!token) return res.status(401).json({ message: 'Missing session token.' });
      return res.json(await service.nextQuestion(getSingleParam(req.params.sessionId), token, req.body.stage));
  }, (error, res) => {
      return res.status(401).json({ message: error instanceof Error ? error.message : 'Unauthorized.' });
  }));

  router.post('/api/interview-sessions/:sessionId/answers', asyncHandler(async (req, res) => {
      const token = getBearerToken(req.header('authorization'));
      if (!token) return res.status(401).json({ message: 'Missing session token.' });
      return res.json(await service.saveAnswer(getSingleParam(req.params.sessionId), token, req.body));
  }, (error, res) => {
      return res.status(401).json({ message: error instanceof Error ? error.message : 'Unauthorized.' });
  }));

  router.post('/api/interview-sessions/:sessionId/complete', asyncHandler(async (req, res) => {
      const token = getBearerToken(req.header('authorization'));
      if (!token) return res.status(401).json({ message: 'Missing session token.' });
      return res.json(await service.complete(getSingleParam(req.params.sessionId), token));
  }, (error, res) => {
      return res.status(401).json({ message: error instanceof Error ? error.message : 'Unauthorized.' });
  }));

  router.get('/api/interview-sessions/:sessionId/readiness', asyncHandler(async (req, res) => {
      const token = getBearerToken(req.header('authorization'));
      if (!token) return res.status(401).json({ message: 'Missing session token.' });

      const sessionId = getSingleParam(req.params.sessionId);
      // Validate token belongs to session (reuse safe context, just check auth)
      await service.getSafeContext(sessionId, token);

      const voiceProvider = process.env.VOICE_AGENT_PROVIDER ?? 'browser';
      const transport = process.env.VOICE_TRANSPORT ?? 'websocket';
      const ttsProvider = process.env.TTS_PROVIDER ?? 'browser_speech';
      const sttProvider =
        voiceProvider === 'pipecat'
          ? process.env.STT_PROVIDER ?? 'whisper'
          : 'browser';

      return res.json({
        sessionId,
        voiceProvider,
        transport,
        requiresMic: true,
        requiresCamera: true,
        ttsProvider,
        sttProvider,
        serverTime: new Date().toISOString(),
        status: 'ready',
      });
  }, (error, res) => {
      return res.status(getErrorStatus(error, 401)).json({ message: getErrorMessage(error, 'Unauthorized.') });
  }));

  router.get('/api/interview-sessions/:sessionId/report', asyncHandler(async (req, res) => {
      const token = getBearerToken(req.header('authorization'));
      if (!token) return res.status(401).json({ message: 'Missing session token.' });
      return res.json(await service.getReport(getSingleParam(req.params.sessionId), token));
  }, (error, res) => {
      return res.status(404).json({ message: error instanceof Error ? error.message : 'Interview report not found.' });
  }));

  router.post('/api/interview-sessions/:sessionId/transcript-events', asyncHandler(async (req, res) => {
      const auth = resolveSessionWriteAuth(req);
      const result = await service.recordTranscriptEvent(getSingleParam(req.params.sessionId), auth, req.body);
      return res.status(result.status).json(result.body);
  }, (error, res) => {
      return res.status(getErrorStatus(error, 401)).json({ message: getSafeErrorMessage(error, 'Unable to persist transcript event.') });
  }));

  router.post('/api/interview-sessions/:sessionId/turns', asyncHandler(async (req, res) => {
      const auth = resolveSessionWriteAuth(req);
      const result = await service.recordTurn(getSingleParam(req.params.sessionId), auth, req.body);
      return res.status(result.status).json(result.body);
  }, (error, res) => {
      return res.status(getErrorStatus(error, 401)).json({ message: getSafeErrorMessage(error, 'Unable to persist interview turn.') });
  }));

  return router;
}

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  onError: (error: unknown, res: Response) => Response,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch((error) => {
      onError(error, res);
    });
  };
}

function getBearerToken(value: string | undefined): string | null {
  if (!value || !value.startsWith('Bearer ')) return null;
  return value.slice('Bearer '.length).trim();
}

function getSingleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function resolveSessionWriteAuth(req: Request): SessionWriteAuth {
  const token = getBearerToken(req.header('authorization'));
  if (token) {
    return { type: 'session', token };
  }

  const providedSecret = req.header('x-pipecat-secret')?.trim();
  if (!providedSecret) {
    throw new Error('Missing session token.');
  }

  const expectedSecret = process.env.PIPECAT_CONNECT_SECRET?.trim();
  if (!expectedSecret) {
    throw new Error('PIPECAT_CONNECT_SECRET is not configured.');
  }

  if (providedSecret !== expectedSecret) {
    throw new Error('Invalid Pipecat secret.');
  }

  return { type: 'internal' };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getSafeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (
    error.message.includes('Missing session token.') ||
    error.message.includes('Invalid Pipecat secret.') ||
    error.message.includes('PIPECAT_CONNECT_SECRET is not configured.') ||
    error.message.includes('Unauthorized') ||
    error.message.includes('not found') ||
    error.message.includes('Invalid ') ||
    error.message.includes('must ')
  ) {
    return error.message;
  }

  return fallback;
}

function getErrorStatus(error: unknown, fallback: number): number {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (error.message.includes('Unauthorized')) {
    return 401;
  }

  if (error.message.includes('not found')) {
    return 404;
  }

  if (error.message.includes('not configured') || error.message.includes('Unsupported VOICE_TRANSPORT')) {
    return 500;
  }

  if (error.message.includes('Invalid Pipecat secret.')) {
    return 403;
  }

  if (error.message.includes('Invalid ') || error.message.includes('must ')) {
    return 400;
  }

  return fallback;
}
