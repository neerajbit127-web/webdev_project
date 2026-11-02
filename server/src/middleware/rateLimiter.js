import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

/**
 * Standard API rate limiter foundation.
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT.WINDOW_MS,
  max: env.RATE_LIMIT.MAX_REQUESTS,
  standardHeaders: true, // Draft-6 `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (_req, res) => {
    return sendError(res, {
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP address. Please try again later.'
    });
  }
});

/**
 * Stricter rate limiter for sensitive authentication endpoints.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return sendError(res, {
      statusCode: 429,
      code: 'TOO_MANY_AUTH_ATTEMPTS',
      message: 'Too many authentication attempts. Please try again after 15 minutes.'
    });
  }
});

export default {
  apiRateLimiter,
  authRateLimiter
};

