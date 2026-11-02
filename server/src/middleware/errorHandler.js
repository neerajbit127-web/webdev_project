import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

/**
 * Centralized error-handling middleware.
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  const message = err.message || 'An unexpected error occurred';

  // Log error with request metadata
  console.error(`[ERROR ${statusCode}] ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    code,
    stack: env.IS_PRODUCTION ? undefined : err.stack
  });

  // Handle malformed JSON body from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendError(res, {
      statusCode: 400,
      code: 'INVALID_JSON_BODY',
      message: 'The request body contains malformed JSON.'
    });
  }

  const details = env.IS_PRODUCTION
    ? undefined
    : { stack: err.stack, details: err.details };

  return sendError(res, {
    statusCode,
    code,
    message: statusCode >= 500 && env.IS_PRODUCTION
      ? 'An internal server error occurred.'
      : message,
    details
  });
}

export default errorHandler;

