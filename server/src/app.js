import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { apiRouter } from './routes/apiRouter.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '../../client');

export function createApp() {
  const app = express();

  // Security Headers via Helmet (CSP disabled to allow frontend inline event handlers & SVG icons)
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  );

  // CORS Configuration derived from validated environment variable
  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      if (env.CLIENT_ORIGINS.includes('*') || env.CLIENT_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS policy blocked access from origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400 // Cache preflight response for 24 hours
  };
  app.use(cors(corsOptions));

  // JSON and URL-encoded body parsers with explicit payload size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Serve frontend static assets from client directory
  app.use(express.static(clientDir));
  // Backward compatibility alias if old folder URL was opened
  app.use('/Online-Exam-Portal', express.static(clientDir));

  // Global rate limiter for API namespace
  app.use('/api', apiRateLimiter);

  // Mount API router
  app.use('/api', apiRouter);

  // Centralized 404 Handler for undefined API routes or assets
  app.use(notFoundHandler);

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
