import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { InterviewBriefService } from '../services/interviewBriefService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

export function createInterviewBriefRouter(service: InterviewBriefService) {
  const router = Router();

  router.post('/api/interview-briefs', upload.single('pdf'), asyncHandler(async (req, res) => {
    const providedSecret = req.header('x-service-secret');
    const expectedSecret = process.env.MOCK_INTERVIEW_SERVICE_SECRET ?? 'dev-secret';
    if (!providedSecret || providedSecret !== expectedSecret) {
      return res.status(403).json({ message: 'Invalid service secret.' });
    }

    const mode = typeof req.body?.mode === 'string' ? req.body.mode.trim() : '';

    if (mode === 'capstone') {
      if (!req.file) {
        return res.status(400).json({ message: 'A PDF file is required for capstone mode (field name: pdf).' });
      }
      const result = await service.createFromPdf(req.file.buffer);
      return res.json(result);
    }

    if (mode === 'skill') {
      const skillName = typeof req.body?.skillName === 'string' ? req.body.skillName.trim() : '';
      if (!skillName) {
        return res.status(400).json({ message: 'skillName is required for skill mode.' });
      }
      const level = typeof req.body?.level === 'string' ? req.body.level.trim() : undefined;
      const result = await service.createFromSkill(skillName, level || undefined);
      return res.json(result);
    }

    if (mode === 'resume') {
      const resumeText = typeof req.body?.resumeText === 'string' ? req.body.resumeText.trim() : '';
      const jobTitle = typeof req.body?.jobTitle === 'string' ? req.body.jobTitle.trim() : '';
      const jobDescription = typeof req.body?.jobDescription === 'string' ? req.body.jobDescription.trim() : '';
      if (!resumeText || !jobTitle || !jobDescription) {
        return res.status(400).json({ message: 'resumeText, jobTitle, and jobDescription are required for resume mode.' });
      }
      const company = typeof req.body?.company === 'string' ? req.body.company.trim() : undefined;
      const matchedSkills = Array.isArray(req.body?.matchedSkills) ? req.body.matchedSkills as string[] : undefined;
      const missingSkills = Array.isArray(req.body?.missingSkills) ? req.body.missingSkills as string[] : undefined;
      const result = await service.createFromResume({
        resumeText,
        jobTitle,
        company: company || undefined,
        jobDescription,
        matchedSkills,
        missingSkills,
      });
      return res.json(result);
    }

    return res.status(400).json({ message: 'mode must be one of: resume, capstone, skill.' });
  }, (_error, res) => {
    return res.status(500).json({ message: 'Unable to create interview brief.' });
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
