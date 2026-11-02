import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

// Construct pool configuration from env
const poolConfig = env.DATABASE.URL
  ? {
      connectionString: env.DATABASE.URL,
      max: env.DATABASE.POOL_MAX,
      idleTimeoutMillis: env.DATABASE.IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DATABASE.CONNECTION_TIMEOUT_MS
    }
  : {
      host: env.DATABASE.HOST,
      port: env.DATABASE.PORT,
      database: env.DATABASE.NAME,
      user: env.DATABASE.USER,
      password: env.DATABASE.PASSWORD,
      max: env.DATABASE.POOL_MAX,
      idleTimeoutMillis: env.DATABASE.IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DATABASE.CONNECTION_TIMEOUT_MS
    };

export const pool = new Pool(poolConfig);

// Monitor idle client errors so they do not crash the application
pool.on('error', (err) => {
  console.error('[DATABASE POOL ERROR] Unexpected error on idle client:', err.message);
});

pool.on('connect', () => {
  // Client acquired
});

/**
 * Executes a parameterized query on the connection pool.
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (!env.IS_PRODUCTION && duration > 1000) {
    console.warn(`[SLOW QUERY] ${duration}ms: ${text}`);
  }
  return res;
}

/**
 * Tests connection to PostgreSQL.
 * @returns {Promise<{ healthy: boolean, latencyMs?: number, error?: string }>}
 */
export async function checkHealth() {
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1 AS alive;');
      const latencyMs = Date.now() - start;
      return { healthy: true, latencyMs };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error.message
    };
  }
}

/**
 * Closes the connection pool gracefully.
 * @returns {Promise<void>}
 */
export async function closePool() {
  try {
    await pool.end();
    console.log('[DATABASE] PostgreSQL pool closed gracefully.');
  } catch (err) {
    console.error('[DATABASE] Error during pool shutdown:', err.message);
  }
}

export default {
  pool,
  query,
  checkHealth,
  closePool
};

