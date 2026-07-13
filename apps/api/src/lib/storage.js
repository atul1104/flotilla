/**
 * S3-compatible object storage. MinIO in dev, Cloudflare R2/MinIO in prod.
 * Presigned PUT for uploads, signed GET for downloads (PLAN.md §3, §11).
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { logger } from './logger.js';

export const s3 = new S3Client({
  region: config.S3_REGION,
  endpoint: config.S3_ENDPOINT,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  },
});

/** Bytes-per-month upload cap per plan (PLAN.md §6). */
const UPLOAD_LIMITS = {
  free: 100 * 1024 * 1024,
  pro: 10 * 1024 * 1024 * 1024,
  enterprise: Number.MAX_SAFE_INTEGER,
};

export function uploadCapForPlan(plan) {
  return UPLOAD_LIMITS[plan] ?? UPLOAD_LIMITS.free;
}

/** Presign a PUT URL for a client-side upload. TTL in seconds. */
export async function presignUpload(storageKey, mime, sizeBytes, ttlSeconds = 300) {
  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: storageKey,
    ContentType: mime,
    ContentLength: sizeBytes,
  });
  return getSignedUrl(s3, command, { expiresIn: ttlSeconds });
}

/** Presign a GET URL for downloading a private object. */
export async function presignDownload(storageKey, ttlSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: storageKey });
  return getSignedUrl(s3, command, { expiresIn: ttlSeconds });
}

/** Delete an object (used when an attachment is removed). */
export async function deleteObject(storageKey) {
  try {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: storageKey }));
  } catch (err) {
    logger.warn({ err, storageKey }, 'failed to delete object');
  }
}

export function buildStorageKey({ userId, filename }) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `uploads/${userId}/${stamp}-${rand}-${safe}`;
}
