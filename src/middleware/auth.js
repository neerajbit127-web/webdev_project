const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'exam_portal_super_secure_jwt_secret_key_2026';

/**
 * Authenticate incoming requests via Bearer JWT token
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.',
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(403).json({
        success: false,
        message: isExpired ? 'Authentication token has expired. Please log in again.' : 'Invalid authentication token.',
        code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      });
    }

    req.user = user;
    next();
  });
}

/**
 * Role-Based Access Control (RBAC) middleware generator
 * @param  {...string} roles - e.g. 'TEACHER', 'STUDENT', 'ADMIN'
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required prior to authorization check.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. This resource requires one of the following roles: [${roles.join(', ')}]. Your role: ${req.user.role}`,
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  JWT_SECRET,
};
