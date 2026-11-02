import { Router } from 'express';
import { getHealth } from '../controllers/healthController.js';

export const healthRouter = Router();

// GET /api/health
healthRouter.get('/', getHealth);

export default healthRouter;

