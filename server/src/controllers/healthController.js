import { checkHealth as checkDbHealth } from '../config/database.js';
import { env } from '../config/env.js';

/**
 * Controller for GET /api/health.
 * Checks both the Express API runtime and the PostgreSQL connection pool.
 */
export async function getHealth(_req, res) {
  const dbHealth = await checkDbHealth();

  const isHealthy = dbHealth.healthy;
  const statusCode = isHealthy ? 200 : 503;

  const payload = {
    success: isHealthy,
    statusCode,
    status: isHealthy ? 'healthy' : 'degraded',
    message: isHealthy
      ? 'ExamPortal API and database operational'
      : 'ExamPortal API operational, but database is unavailable',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    checks: {
      api: {
        status: 'up',
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
      },
      database: {
        status: dbHealth.healthy ? 'connected' : 'disconnected',
        engine: 'PostgreSQL',
        latencyMs: dbHealth.latencyMs,
        ...(dbHealth.error ? { error: dbHealth.error } : {})
      }
    }
  };

  return res.status(statusCode).json(payload);
}

export default {
  getHealth
};

