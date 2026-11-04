import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { generateToken } from '../utils/token.js';
import { sendSuccess, sendError } from '../utils/response.js';

const LOGIN_ROLES = new Set(['STUDENT', 'TEACHER', 'ADMIN']);
const REGISTER_ROLES = new Set(['STUDENT', 'TEACHER']);

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * POST /api/auth/register
 * Public self-registration is limited to STUDENT and TEACHER.
 */
export async function register(req, res) {
  const fullName = cleanString(req.body?.fullName);
  const email = cleanString(req.body?.email).toLowerCase();
  const studentId = cleanString(req.body?.studentId).toUpperCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = cleanString(req.body?.role).toUpperCase();

  if (!fullName || !email || !password || !role || (role === 'STUDENT' && !studentId)) {
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: role === 'STUDENT'
        ? 'Name, email, student ID, password, and role are required.'
        : 'Name, email, password, and role are required.'
    });
  }

  if (!REGISTER_ROLES.has(role)) {
    return sendError(res, {
      statusCode: 400,
      code: 'INVALID_ROLE',
      message: 'Only Student and Teacher accounts can be created through public registration.'
    });
  }

  if (fullName.length > 150 || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (studentId && studentId.length > 50) ||
      password.length < 12 || password.length > 128) {
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Enter a valid name and email. Passwords must be 12–128 characters.'
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, student_id, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, full_name, email, student_id, role;`,
      [fullName, email, role === 'STUDENT' ? studentId : null, passwordHash, role]
    );
    const user = rows[0];
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Account created successfully. You can now sign in.',
      data: { id: user.id, fullName: user.full_name, email: user.email, studentId: user.student_id, role: user.role }
    });
  } catch (error) {
    if (error.code === '23505') {
      return sendError(res, {
        statusCode: 409,
        code: 'ACCOUNT_ALREADY_EXISTS',
        message: 'An account with this email or student ID already exists.'
      });
    }
    if (error.code === 'ECONNREFUSED' || error.code === '57P01') {
      return sendError(res, {
        statusCode: 503,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Registration is temporarily unavailable. Please try again later.'
      });
    }
    throw error;
  }
}

/**
 * POST /api/auth/login
 */
export async function login(req, res) {
  const identifier = cleanString(req.body?.identifier);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = cleanString(req.body?.role).toUpperCase();

  if (!identifier || !password || !role) {
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Identifier, password, and role are required.'
    });
  }

  if (!LOGIN_ROLES.has(role)) {
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
    console.error('[AUTH] Database lookup failed:', error.message);
    return sendError(res, {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Authentication is temporarily unavailable. Please try again later.'
    });
  }

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

  // Record only successful logins; never store passwords, hashes, or JWTs.
  try {
    await pool.query(
      'INSERT INTO login_events (user_id, ip_address, user_agent) VALUES ($1, $2, $3);',
      [user.id, req.ip || null, req.get('user-agent')?.slice(0, 500) || null]
    );
  } catch (error) {
    console.error('[AUTH] Login audit write failed:', error.message);
    return sendError(res, {
      statusCode: 503,
      code: 'LOGIN_AUDIT_UNAVAILABLE',
      message: 'Unable to complete sign in right now. Please try again later.'
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
    data: { token, user: userPayload }
  });
}

/**
 * GET /api/auth/users — ADMIN only.
 */
export async function getUsers(req, res) {
  const { rows } = await pool.query(
    `SELECT id, full_name, email, student_id, role, is_active, created_at
       FROM users
      ORDER BY created_at DESC;`
  );
  return sendSuccess(res, { message: 'Registered users retrieved', data: rows });
}

/**
 * GET /api/auth/login-activity — ADMIN only.
 */
export async function getLoginActivity(req, res) {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
  const { rows } = await pool.query(
    `SELECT le.id, le.logged_in_at, le.ip_address, le.user_agent,
            u.full_name, u.email, u.student_id, u.role
       FROM login_events le
       JOIN users u ON u.id = le.user_id
      ORDER BY le.logged_in_at DESC
      LIMIT $1;`,
    [limit]
  );
  return sendSuccess(res, { message: 'Login activity retrieved', data: rows });
}

/**
 * GET /api/auth/me
 */
export async function getMe(req, res) {
  return sendSuccess(res, { message: 'Active profile retrieved', data: req.user });
}

export default { register, login, getMe, getUsers, getLoginActivity };
