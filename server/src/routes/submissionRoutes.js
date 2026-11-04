import { Router } from 'express';
import {
  getSubmissionState,
  putAnswer,
  submitExamHandler,
  recordIntegrityEvent,
  getMySubmissionHistory,
  getSubmissionReview
} from '../controllers/submissionController.js';
import { verifyAuth, requireRole } from '../middleware/auth.js';

export const submissionRouter = Router();

// All submission routes require authentication
submissionRouter.use(verifyAuth);

// Student's completed test history
submissionRouter.get('/mine', requireRole('STUDENT'), getMySubmissionHistory);

// Post-submission answer review (owner or administrator)
submissionRouter.get('/:id/review', getSubmissionReview);

// GET /api/submissions/:id         — full attempt state (also accessible as /state sub-path)
submissionRouter.get('/:id', getSubmissionState);
submissionRouter.get('/:id/state', getSubmissionState);

// PUT /api/submissions/:id/answers/:questionId  — save/clear an answer (upsert, idempotent)
submissionRouter.put('/:id/answers/:questionId', putAnswer);

// POST /api/submissions/:id/submit  — finalize and score the exam
submissionRouter.post('/:id/submit', submitExamHandler);

// POST /api/submissions/:id/integrity-event  — record anti-cheat telemetry
submissionRouter.post('/:id/integrity-event', recordIntegrityEvent);

export default submissionRouter;
