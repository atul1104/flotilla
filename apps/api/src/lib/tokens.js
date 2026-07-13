/** Crypto helpers for opaque tokens (email verify, password reset, device
 *  tokens). Tokens are returned to the client once and stored as sha256 hashes
 *  — never store raw tokens (PLAN.md §11). */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/** Cryptographically random hex token. Default 256 bits. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

/** sha256 hex hash of a token (what we persist). */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time equality for hashed comparisons. */
export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
