/**
 * Standardized API response formatters.
 */

/**
 * Sends a standardized success JSON response.
 * @param {import('express').Response} res
 * @param {object} options
 * @param {*} [options.data] - Main payload
 * @param {string} [options.message] - Optional human-readable message
 * @param {number} [options.statusCode=200] - HTTP status code
 * @param {object} [options.meta] - Optional pagination or metadata
 */
export function sendSuccess(res, { data = null, message = 'Success', statusCode = 200, meta = null } = {}) {
  const payload = {
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString()
  };

  if (meta) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

/**
 * Sends a standardized error JSON response.
 * @param {import('express').Response} res
 * @param {object} options
 * @param {string} [options.message] - Error message
 * @param {number} [options.statusCode=500] - HTTP status code
 * @param {string} [options.code='INTERNAL_ERROR'] - Machine-readable error code
 * @param {*} [options.details] - Detailed error info or validation errors
 */
export function sendError(res, { message = 'Internal Server Error', statusCode = 500, code = 'INTERNAL_ERROR', details = null } = {}) {
  const payload = {
    success: false,
    statusCode,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    timestamp: new Date().toISOString()
  };

  return res.status(statusCode).json(payload);
}

export default {
  sendSuccess,
  sendError
};

