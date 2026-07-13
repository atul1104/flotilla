/**
 * Sentry init for the API (PLAN.md §14 — Phase 8 observability). No-op when
 * SENTRY_DSN is unset, so dev/test incur no cost. Called before boot so request
 * isolation + error capture are in place.
 */
import * as Sentry from '@sentry/node';
import { config } from '../config.js';

let initialized = false;

export function initSentry() {
  if (initialized || !config.SENTRY_DSN || config.isTest) return null;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: config.isProd ? 0.1 : 1.0,
  });
  initialized = true;
  return Sentry;
}

export function getSentry() {
  return initialized ? Sentry : null;
}

/** Capture an error without crashing the caller. */
export function captureError(err, context = {}) {
  const s = getSentry();
  if (!s) return;
  s.captureException(err, { extra: context });
}
