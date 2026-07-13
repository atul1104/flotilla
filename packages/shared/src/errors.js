/**
 * Application error hierarchy.
 *
 * Services throw these; the Express error middleware (apps/api/src/middleware/error.js)
 * maps them to HTTP status + JSON body. Unknown errors become 500.
 */

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {number} [opts.status=500]
   * @param {string} [opts.code]       machine-readable code for the client
   * @param {object} [opts.details]    extra structured detail
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = opts.status ?? 500;
    this.code = opts.code ?? this.name;
    this.details = opts.details;
  }

  toJSON() {
    return { error: this.message, code: this.code, details: this.details };
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { status: 400, code: 'VALIDATION_ERROR', details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, { status: 401, code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, { status: 403, code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { status: 404, code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, { status: 409, code: 'CONFLICT' });
  }
}

/** A plan limit was hit (agent cap, upload quota, history gate). 402 — the
 *  action is available on a higher plan. PLAN.md §6. */
export class PaymentRequiredError extends AppError {
  constructor(message = 'Plan limit reached') {
    super(message, { status: 402, code: 'PLAN_LIMIT' });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, { status: 429, code: 'RATE_LIMITED' });
  }
}

/**
 * A run was refused by the agent loop-safety guards (PLAN.md §8.4): chain-depth
 * cap, per-workspace hourly cap, or self-trigger guard. Surfaces as 429 from the
 * REST trigger paths; the message path catches it and posts a thread note.
 */
export class RunRefusedError extends RateLimitError {
  constructor(message, reason) {
    super(message);
    this.code = 'RUN_REFUSED';
    this.details = { reason };
  }
}

/** Wrap a thrown value into an AppError (unknown errors -> generic 500). */
export function toAppError(err) {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : 'Internal error';
  return new AppError(message, { status: 500 });
}
