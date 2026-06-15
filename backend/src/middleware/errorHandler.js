/**
 * Centralized error handler middleware.
 * Formats all errors consistently as { error, message, details }.
 * Must be registered LAST in the Express middleware chain.
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // Prisma known errors
  if (err.code) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        return res.status(409).json({
          error: 'Conflict',
          message: 'A record with this data already exists',
          details: err.meta?.target,
        });
      case 'P2025': // Record not found
        return res.status(404).json({
          error: 'Not Found',
          message: 'The requested record does not exist',
        });
      case 'P2003': // Foreign key constraint
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid reference: related record does not exist',
          details: err.meta?.field_name,
        });
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
  }

  // CORS error
  if (err.message && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ error: 'Forbidden', message: err.message });
  }

  // Validation errors (thrown manually with status)
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.error || 'Error',
      message: err.message,
      details: err.details,
    });
  }

  // Default 500
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

/**
 * Helper to create a structured HTTP error.
 * Usage: throw createError(400, 'Bad Request', 'Amount must be positive')
 */
const createError = (statusCode, error, message, details = null) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.error = error;
  err.message = message;
  err.details = details;
  return err;
};

module.exports = { errorHandler, createError };
