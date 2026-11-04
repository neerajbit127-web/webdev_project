import { Router } from 'express';
import {
  register,
  login,
  getMe,
  getUsers,
  getLoginActivity
} from '../controllers/authController.js';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

export const authRouter = Router();

// Public account creation is restricted inside the controller to STUDENT / TEACHER.
authRouter.post('/register', authRateLimiter, register);
authRouter.post('/login', authRateLimiter, login);

authRouter.get('/me', verifyAuth, getMe);

// Account directory and sign-in history are administrator-only.
authRouter.get('/users', verifyAuth, requireRole('ADMIN'), getUsers);
authRouter.get('/login-activity', verifyAuth, requireRole('ADMIN'), getLoginActivity);

export default authRouter;
