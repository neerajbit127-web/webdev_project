import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Generates a signed JWT access token.
 * @param {object} payload - Claims to embed in token (id, email, role, etc.)
 * @returns {string} Signed JWT
 */
export function generateToken(payload) {
  return jwt.sign(payload, env.JWT.SECRET, {
    expiresIn: env.JWT.EXPIRES_IN
  });
}

/**
 * Verifies and decodes a JWT access token.
 * @param {string} token
 * @returns {object} Decoded token payload
 */
export function verifyToken(token) {
  return jwt.verify(token, env.JWT.SECRET);
}

export default {
  generateToken,
  verifyToken
};

