import { NextFunction, Request, Response, Router } from 'express';
import { SessionService } from '../services/sessionService.js';

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

  router.get('/api/interview-sessions/:sessionId/report', asyncHandler(async (req, res) => {
      const token = getBearerToken(req.header('authorization'));
      if (!token) return res.status(401).json({ message: 'Missing session token.' });
      return res.json(await service.getReport(getSingleParam(req.params.sessionId), token));
  }, (error, res) => {
      return res.status(404).json({ message: error instanceof Error ? error.message : 'Interview report not found.' });
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
