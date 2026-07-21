/**
 * Symmetric encryption for secrets stored at rest (GitHub tokens, Phase 8+ —
 * GIT_COLLABORATION.md §Security). AES-256-GCM: random 12-byte IV per record +
 * authenticated tag, so ciphertexts are unique and tamper-evident.
 *
 * The key is derived (scrypt) from GITHUB_TOKEN_ENCRYPTION_KEY (preferred) or
 * SESSION_SECRET so tokens survive restarts. A dev fallback keeps tests/local
 * working without configuration — it logs a warning, never used in prod.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config } from '../config.js';
import { logger } from './logger.js';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;
const SALT = 'flotilla-at-rest-v1';

let cachedKey = null;
let warnedFallback = false;

function resolveSecret() {
  const explicit = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (explicit) return explicit;
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!warnedFallback) {
    warnedFallback = true;
    if (!config.isTest) {
      logger.warn(
        'GITHUB_TOKEN_ENCRYPTION_KEY unset — deriving GitHub-token key from insecure dev fallback. Set it in production.',
      );
    }
  }
  return 'dev-insecure-git-token-key';
}

function key() {
  if (!cachedKey) cachedKey = scryptSync(resolveSecret(), SALT, 32);
  return cachedKey;
}

/** Encrypt a UTF-8 plaintext → "v1:<ivHex>:<authTagHex>:<ciphertextHex>". */
export function encrypt(plaintext) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join(
    ':',
  );
}

/** Decrypt a blob produced by encrypt(). Throws on version mismatch / tamper. */
export function decrypt(blob) {
  const parts = String(blob).split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(`unsupported ciphertext (expected ${VERSION})`);
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

/** Round-trip helper for tests + smoke checks. */
export function isEncryptedBlob(value) {
  return typeof value === 'string' && value.split(':').length === 4 && value.startsWith(`${VERSION}:`);
}
