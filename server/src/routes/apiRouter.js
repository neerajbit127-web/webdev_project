import { Router } from 'express';
import { healthRouter } from './healthRoutes.js';
import { authRouter } from './authRoutes.js';
import { examRouter } from './examRoutes.js';

export const apiRouter = Router();

// Foundation endpoints
apiRouter.use('/health', healthRouter);

// Authentication & Profile Endpoints
apiRouter.use('/auth', authRouter);

// Exam Management Endpoints
apiRouter.use('/exams', examRouter);

export default apiRouter;
