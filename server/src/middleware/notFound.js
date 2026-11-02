import { sendError } from '../utils/response.js';

/**
 * 404 Handler for unmatched routes.
 */
export function notFoundHandler(req, res) {
  return sendError(res, {
    statusCode: 404,
    code: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
}

export default notFoundHandler;

