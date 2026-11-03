const app = require('./src/app');
const db = require('./src/config/db');

const PORT = process.env.PORT || 5000;

// Initialize server listener
const server = app.listen(PORT, async () => {
  console.log('====================================================');
  console.log(`🚀 ExamPortal Server running on port ${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/health`);
  console.log(`🌐 Frontend Portal: http://localhost:${PORT}`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('====================================================');

  // Verify DB connectivity on startup
  try {
    await db.query('SELECT 1');
    console.log('✅ PostgreSQL connection established successfully.');
  } catch (err) {
    console.warn('⚠️  PostgreSQL connection warning:', err.message);
    console.warn('💡 Tip: Ensure DATABASE_URL is configured or run: npm run migrate');
  }
});

// Graceful Shutdown for zero-downtime rolling deployments (e.g. Render, Kubernetes)
const gracefulShutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log('[Server] HTTP listener closed. Closing PostgreSQL connection pool...');
    try {
      await db.pool.end();
      console.log('[Server] Database pool terminated cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[Server Error] Error while shutting down pool:', err.message);
      process.exit(1);
    }
  });

  // Force shutdown if connections do not close in time
  setTimeout(() => {
    console.error('[Server] Forcing shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
