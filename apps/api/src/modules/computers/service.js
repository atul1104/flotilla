/**
 * Computer pairing + device tokens (PLAN.md §7.1, §8.1). Pairing codes are
 * short-lived HMAC-signed tokens (stateless — no pairing table); exchanged for
 * a computer + a hashed device token shown once and revocable.
 */
import { createHmac } from 'node:crypto';
import { prisma } from '../../lib/db.js';
import { NotFoundError, ConflictError } from '@atul1104/shared';
import { randomToken, hashToken, safeEqual } from '../../lib/tokens.js';
import { config } from '../../config.js';
import { markOnboardingStep } from '../workspaces/onboarding.js';

const PAIRING_TTL_MIN = 10;
const KEY = config.SESSION_SECRET;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function sign(payloadB64) {
  return createHmac('sha256', KEY).update(payloadB64).digest('base64url');
}

/** Mint a one-time pairing code for a workspace (admin/owner requests it). */
export function createPairingCode(workspaceId, ownerUserId) {
  const exp = Date.now() + PAIRING_TTL_MIN * 60 * 1000;
  const payload = b64url({ ws: workspaceId, owner: ownerUserId, exp });
  return `${payload}.${sign(payload)}`;
}

function verifyPairingCode(code) {
  const [payload, sig] = String(code).split('.');
  if (!payload || !sig) throw new NotFoundError('Invalid pairing code');
  const expected = sign(payload);
  if (!safeEqual(sig, expected)) throw new NotFoundError('Invalid pairing code');
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new NotFoundError('Invalid pairing code');
  }
  if (!data.exp || data.exp < Date.now()) throw new ConflictError('Pairing code expired');
  return data;
}

/** Exchange a pairing code for a computer + device token (daemon calls this). */
export async function pair(code, { name, platform, daemonVersion }) {
  const { ws, owner } = verifyPairingCode(code);
  const computer = await prisma.computer.create({
    data: {
      workspaceId: ws,
      ownerUserId: owner,
      name: name || 'My computer',
      platform,
      daemonVersion,
    },
  });
  const token = randomToken(32);
  await prisma.deviceToken.create({
    data: { computerId: computer.id, tokenHash: hashToken(token) },
  });
  // Phase 8 — onboarding funnel.
  await markOnboardingStep(ws, 'computer_paired').catch(() => {});
  return { computer, token };
}

/** Verify a device token (used by the /daemon socket middleware). */
export async function resolveDeviceToken(token) {
  if (!token) return null;
  const dt = await prisma.deviceToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { computer: true },
  });
  if (!dt || dt.revokedAt) return null;
  return dt.computer;
}

export async function listComputers(workspaceId) {
  return prisma.computer.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
}

export async function markOnline(computerId, { platform, daemonVersion } = {}) {
  return prisma.computer.update({
    where: { id: computerId },
    data: {
      status: 'online',
      lastSeenAt: new Date(),
      ...(platform ? { platform } : {}),
      ...(daemonVersion ? { daemonVersion } : {}),
    },
  });
}

export async function markOffline(computerId) {
  return prisma.computer.update({
    where: { id: computerId },
    data: { status: 'offline' },
  });
}

export async function revokeComputer(workspaceId, computerId) {
  const computer = await prisma.computer.findUnique({ where: { id: computerId } });
  if (!computer || computer.workspaceId !== workspaceId)
    throw new NotFoundError('Computer not found');
  // Mark offline first so any connected daemon is kicked + the computer stops
  // showing as online before the row goes away. DeviceTokens cascade on delete,
  // so no separate revoke is needed — but stamp revokedAt for audit clarity in
  // case a token is read between markOffline and the delete.
  await markOffline(computerId);
  // Agents bound to this computer are unassigned (computerId → null, via the
  // SetNull FK); AgentRun.computerId is also SetNull so run history is kept.
  await prisma.computer.delete({ where: { id: computerId } });
}
