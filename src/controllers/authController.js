const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

/**
 * Generate JWT token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

/**
 * POST /api/auth/register
 */
async function register(req, res) {
  const { name, email, password, role = 'STUDENT', department } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Name, email/ID, and password are required fields.',
    });
  }

  const validRoles = ['TEACHER', 'STUDENT', 'ADMIN'];
  const userRole = role.toUpperCase();
  if (!validRoles.includes(userRole)) {
    return res.status(400).json({
      success: false,
      message: `Invalid role specified. Must be one of: ${validRoles.join(', ')}`,
    });
  }

  try {
    // Check if user already exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email or ID already exists in the system.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, department, created_at`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, userRole, department || null]
    );

    const newUser = result.rows[0];
    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        user: newUser,
        token,
      },
    });
  } catch (err) {
    console.error('[Auth Register Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while processing registration.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  const { identifier, email, password, role } = req.body;
  const userIdentifier = (identifier || email || '').trim().toLowerCase();

  if (!userIdentifier || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both username/email/ID and password.',
    });
  }

  try {
    const result = await db.query(
      'SELECT id, name, email, password_hash, role, department FROM users WHERE LOWER(email) = $1',
      [userIdentifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User was not found.',
      });
    }

    const user = result.rows[0];

    // Optional role verification if role was explicitly provided
    if (role && user.role.toUpperCase() !== role.toUpperCase()) {
      return res.status(403).json({
        success: false,
        message: `Account role mismatch. This account is registered as ${user.role}, not ${role.toUpperCase()}.`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.',
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
        },
      },
    });
  } catch (err) {
    console.error('[Auth Login Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during authentication.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

/**
 * GET /api/auth/me
 */
async function getCurrentUser(req, res) {
  try {
    const result = await db.query(
      'SELECT id, name, email, role, department, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Auth Me Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile information.',
    });
  }
}

module.exports = {
  register,
  login,
  getCurrentUser,
};
