import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { closePool } from './config/database.js';

const server = http.createServer(app);

server.listen(env.PORT, () => {
  console.log(`[SERVER] ExamPortal API running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  console.log(`[SERVER] Health endpoint available at http://localhost:${env.PORT}/api/health`);
  console.log(`[SERVER] Allowed CORS origins: ${env.CLIENT_ORIGINS.join(', ')}`);
});

/**
 * Graceful termination handler.
 */
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[SERVER] ${signal} signal received. Commencing graceful shutdown...`);

  // Close HTTP server first (stop accepting new requests)
  server.close(async (err) => {
    if (err) {
      console.error('[SERVER] Error during HTTP server close:', err);
      process.exit(1);
    }
    console.log('[SERVER] HTTP connections closed.');

    // Close Database Pool
    try {
      await closePool();
      console.log('[SERVER] Graceful shutdown completed cleanly.');
      process.exit(0);
    } catch (dbErr) {
      console.error('[SERVER] Error during database shutdown:', dbErr);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds if connections refuse to close
  setTimeout(() => {
    console.error('[SERVER] Forced shutdown: connections timed out after 10s.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[SERVER CRITICAL] Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

export default server;

