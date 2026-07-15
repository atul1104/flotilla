/**
 * Central error handler. Maps AppError -> status/body; logs unknowns.
 * Must be registered last (after all routes + notFound).
 */
import { AppError, toAppError } from '@atul1104/shared';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { captureError } from '../lib/sentry.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const appErr = toAppError(err);

  // Prisma unique-constraint violation -> 409
  if (err?.code === 'P2002') {
    return res.status(409).json({
      error: 'A record with that value already exists',
      code: 'CONFLICT',
      details: { target: err.meta?.target },
    });
  }
  // Prisma record not found -> 404
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  }
  // Prisma malformed id / invalid UUID (and validation errors) -> 400, not 500.
  if (err?.code === 'P2023' || err?.name === 'PrismaClientValidationError') {
    return res.status(400).json({ error: 'Invalid identifier or input', code: 'BAD_REQUEST' });
  }

  if (appErr.status >= 500) {
    logger.error({ err, url: req.originalUrl, method: req.method }, 'request failed');
    captureError(err, { url: req.originalUrl, method: req.method });
  }

  const body = { error: appErr.message, code: appErr.code };
  if (appErr.details) body.details = appErr.details;
  if (config.isDev && appErr.status >= 500 && err?.stack) body.stack = err.stack;
  // In production, never echo internal 5xx detail (DB hosts, constraint names)
  // to the client — the real error is logged server-side above.
  if (!config.isDev && appErr.status >= 500) {
    body.error = 'Internal Server Error';
    body.code = 'INTERNAL_ERROR';
    delete body.details;
  }

  res.status(appErr.status).json(body);
}

/** True AppError subclass check (used by tests). */
export { AppError };
