import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env relative to the server root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRootDir = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(serverRootDir, '.env') });

/**
 * Validates and normalizes environment variables.
 * Throws early on invalid or missing critical configuration in production.
 */
function validateEnv() {
  const errors = [];
  const warnings = [];

  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  // Port validation
  const port = parseInt(process.env.PORT || '5000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`Invalid PORT specified: "${process.env.PORT}". Must be an integer between 1 and 65535.`);
  }

  // Client origins for CORS
  const rawOrigins = process.env.CLIENT_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000,http://127.0.0.1:5000';
  const clientOrigins = rawOrigins.split(',').map(o => o.trim()).filter(Boolean);
  if (clientOrigins.length === 0) {
    errors.push('CLIENT_ORIGIN must contain at least one valid origin URL.');
  }

  // JWT Secret validation
  const jwtSecret = process.env.JWT_SECRET || '';
  if (isProduction) {
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('replace_with_a_secure')) {
      errors.push('JWT_SECRET must be set to a secure string with at least 32 characters in production.');
    }
  } else if (!jwtSecret) {
    warnings.push('JWT_SECRET is not set. A temporary development fallback secret will be used.');
  }

  // Database settings
  const databaseUrl = process.env.DATABASE_URL;
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  const dbName = process.env.DB_NAME || 'exam_portal_db';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || '';

  if (isNaN(dbPort)) {
    errors.push(`Invalid DB_PORT specified: "${process.env.DB_PORT}". Must be a valid port number.`);
  }

  if (isProduction && !databaseUrl && !dbPassword) {
    errors.push('Either DATABASE_URL or DB_PASSWORD must be provided in production.');
  }

  if (errors.length > 0) {
    throw new Error(`Environment configuration error(s):\n - ${errors.join('\n - ')}`);
  }

  if (warnings.length > 0) {
    warnings.forEach(warn => console.warn(`[CONFIG WARNING] ${warn}`));
  }

  return Object.freeze({
    NODE_ENV: nodeEnv,
    IS_PRODUCTION: isProduction,
    PORT: port,
    CLIENT_ORIGINS: clientOrigins,
    JWT: {
      SECRET: jwtSecret || 'dev_insecure_jwt_secret_key_examportal_2026',
      EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h'
    },
    DATABASE: {
      URL: databaseUrl,
      HOST: dbHost,
      PORT: dbPort,
      NAME: dbName,
      USER: dbUser,
      PASSWORD: dbPassword,
      POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),
      IDLE_TIMEOUT_MS: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
      CONNECTION_TIMEOUT_MS: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '3000', 10)
    },
    RATE_LIMIT: {
      WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
    },
    UPLOADS: {
      MAX_FILE_SIZE_BYTES: (parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10)) * 1024 * 1024,
      DIR: path.resolve(serverRootDir, process.env.UPLOAD_DIR || 'uploads')
    }
  });
}

export const env = validateEnv();
export default env;

