import { verifyToken } from '../utils/token.js';
import { sendError } from '../utils/response.js';

/**
 * Authentication middleware that verifies JWT from the Authorization header.
 * Attaches decoded user claims to req.user: { id, email, role, fullName, studentId }
 */
export function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Access denied. Valid Bearer authorization token is required.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, {
        statusCode: 401,
        code: 'TOKEN_EXPIRED',
        message: 'Your authentication session has expired. Please log in again.'
      });
    }

    return sendError(res, {
      statusCode: 401,
      code: 'INVALID_TOKEN',
      message: 'Authentication token is invalid or malformed.'
    });
  }
}

/**
 * Role-Based Access Control middleware generator.
 * @param {...string} allowedRoles - e.g. 'TEACHER', 'ADMIN'
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required prior to role authorization.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: `Forbidden: Access restricted to [${allowedRoles.join(', ')}]. Your role is ${req.user.role}.`
      });
    }

    return next();
  };
}

export default {
  verifyAuth,
  requireRole
};

