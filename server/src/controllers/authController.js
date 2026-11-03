import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { generateToken } from '../utils/token.js';
import { sendSuccess, sendError } from '../utils/response.js';

const ALLOWED_ROLES = new Set(['STUDENT', 'TEACHER', 'ADMIN']);

/**
 * POST /api/auth/login
 *
 * Authentication always requires a provisioned database account and a valid
 * password. There is deliberately no demo/offline fallback: issuing a token
 * when PostgreSQL is unavailable would bypass authentication.
 */
export async function login(req, res) {
  const identifier = typeof req.body?.identifier === 'string'
    ? req.body.identifier.trim()
    : '';
  const password = typeof req.body?.password === 'string'
    ? req.body.password
    : '';
  const role = typeof req.body?.role === 'string'
    ? req.body.role.trim().toUpperCase()
    : '';

  if (!identifier || !password || !role) {
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Identifier, password, and role are required.'
    });
  }

  if (!ALLOWED_ROLES.has(role)) {
    return sendError(res, {
      statusCode: 400,
      code: 'INVALID_ROLE',
      message: 'The requested account role is invalid.'
    });
  }

  let user;
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, email, student_id, password_hash, role, is_active
         FROM users
        WHERE LOWER(email) = LOWER($1)
           OR (student_id IS NOT NULL AND LOWER(student_id) = LOWER($1))
        ORDER BY CASE WHEN LOWER(email) = LOWER($1) THEN 0 ELSE 1 END
        LIMIT 1;`,
      [identifier]
    );
    user = rows[0];
  } catch (error) {
    // Never fall back to demo credentials when the database is down or broken.
    console.error('[AUTH] Database lookup failed:', error.message);
    return sendError(res, {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Authentication is temporarily unavailable. Please try again later.'
    });
  }

  // Use one generic response for unknown users, wrong roles, disabled accounts,
  // and incorrect passwords to avoid disclosing account details.
  if (!user || user.role !== role || !user.is_active || !user.password_hash) {
    return sendError(res, {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid identifier, password, or account role.'
    });
  }

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(password, user.password_hash);
  } catch (error) {
    console.error('[AUTH] Password verification failed:', error.message);
  }

  if (!passwordMatches) {
    return sendError(res, {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid identifier, password, or account role.'
    });
  }

  const userPayload = {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    studentId: user.student_id
  };

  const token = generateToken(userPayload);

  return sendSuccess(res, {
    message: 'Authentication successful',
    data: {
      token,
      user: userPayload
    }
  });
}

/**
 * GET /api/auth/me
 */
export async function getMe(req, res) {
  return sendSuccess(res, {
    message: 'Active profile retrieved',
    data: req.user
  });
}

export default { login, getMe };
