import { Router } from 'express';
import { healthRouter } from './healthRoutes.js';
import { authRouter } from './authRoutes.js';
import { examRouter } from './examRoutes.js';
import { submissionRouter } from './submissionRoutes.js';

export const apiRouter = Router();

// Foundation endpoints
apiRouter.use('/health', healthRouter);

// Authentication & Profile Endpoints
apiRouter.use('/auth', authRouter);

// Exam Management Endpoints
apiRouter.use('/exams', examRouter);

// Submissions & Student Attempt Endpoints
apiRouter.use('/submissions', submissionRouter);

export default apiRouter;
