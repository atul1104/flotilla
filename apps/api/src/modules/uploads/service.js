/**
 * Upload business logic. Presigned PUT to S3/MinIO; attachment row created up
 * front (messageId null) and connected when the message is sent (PLAN.md §7.1).
 */
import { prisma } from '../../lib/db.js';
import { ValidationError } from '@flotila-org/shared';
import { presignUpload, buildStorageKey } from '../../lib/storage.js';
import { assertUploadQuota } from '../../lib/limits.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
const ALLOWED_MIME_PREFIXES = [
  'image/',
  'text/',
  'application/pdf',
  'application/json',
  'application/zip',
  'application/x-zip',
  'application/gzip',
  'application/octet-stream',
  'video/',
  'audio/',
];

export async function createPresign({ userId, workspaceId, workspacePlan, filename, mime, size }) {
  if (!filename || filename.length > 255) throw new ValidationError('Invalid filename');
  if (typeof size !== 'number' || size <= 0 || size > MAX_FILE_BYTES) {
    throw new ValidationError(`File must be 1 byte – ${MAX_FILE_BYTES} bytes`);
  }
  if (!ALLOWED_MIME_PREFIXES.some((p) => mime?.startsWith(p))) {
    throw new ValidationError('Unsupported file type');
  }

  // Per-plan monthly upload quota (PLAN.md §6).
  if (workspaceId) await assertUploadQuota(workspaceId, workspacePlan, size);

  const storageKey = buildStorageKey({ userId, filename });
  const uploadUrl = await presignUpload(storageKey, mime, size);

  const attachment = await prisma.attachment.create({
    data: {
      uploaderId: userId,
      filename,
      mime,
      sizeBytes: BigInt(size),
      storageKey,
    },
  });

  return {
    attachmentId: attachment.id,
    uploadUrl,
    storageKey,
    method: 'PUT',
    headers: { 'content-type': mime },
  };
}

/** Optional: confirm an upload landed. We trust the presigned PUT completed. */
export async function completeUpload(_attachmentId) {
  return { ok: true };
}

export { MAX_FILE_BYTES };
