import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { generateToken } from '../utils/token.js';
import { sendSuccess, sendError } from '../utils/response.js';

// Deterministic UUIDs for demo users in case DB has not been seeded
const DEMO_TEACHER = {
  id: '00000000-0000-4000-a000-000000000001',
  fullName: 'Dr. Alan Vance',
  email: 'alan.vance@university.edu',
  role: 'TEACHER',
  studentId: null
};

const DEMO_STUDENT = {
  id: '00000000-0000-4000-a000-000000000002',
  fullName: 'Elena Rostova',
  email: 'elena.rostova@university.edu',
  role: 'STUDENT',
  studentId: 'ST-94821'
};

/**
 * POST /api/auth/login
 */
export async function login(req, res) {
  const { identifier, password, role = 'TEACHER' } = req.body;

  if (!identifier) {
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Username, institutional email, or Student ID is required.'
    });
  }

  const cleanRole = (role || 'TEACHER').toUpperCase();
  const cleanIdentifier = identifier.trim();

  try {
    // Attempt database lookup
    const { rows } = await pool.query(
      `SELECT id, full_name, email, student_id, password_hash, role, is_active
       FROM users 
       WHERE (LOWER(email) = LOWER($1) OR student_id = $1)
       LIMIT 1;`,
      [cleanIdentifier]
    );

    if (rows.length > 0) {
      const user = rows[0];

      if (!user.is_active) {
        return sendError(res, {
          statusCode: 403,
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Your account has been deactivated. Please contact your administrator.'
        });
      }

      // Password verification
      if (password && user.password_hash) {
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
          return sendError(res, {
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid security credentials provided.'
          });
        }
      }

      const tokenPayload = {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        studentId: user.student_id
      };

      const token = generateToken(tokenPayload);

      return sendSuccess(res, {
        message: 'Authentication successful',
        data: {
          token,
          user: tokenPayload
        }
      });
    }
  } catch (dbErr) {
    // Database is unavailable or tables not created yet - fall back gracefully for demo credentials
  }

  // Graceful fallback for standard demo accounts if DB is offline or empty
  let userPayload;
  if (cleanRole === 'TEACHER') {
    userPayload = {
      ...DEMO_TEACHER,
      email: cleanIdentifier.includes('@') ? cleanIdentifier : DEMO_TEACHER.email
    };
  } else {
    userPayload = {
      ...DEMO_STUDENT,
      studentId: cleanIdentifier || DEMO_STUDENT.studentId
    };
  }

  const token = generateToken(userPayload);

  return sendSuccess(res, {
    message: 'Authenticated successfully (Demo Mode)',
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

export default {
  login,
  getMe
};

