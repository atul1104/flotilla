/**
 * Auth business logic: argon2id passwords, sessions, email verification,
 * password reset. Email flows point at the web app (APP_ORIGIN) which calls
 * the API; Mailpit captures mail in dev (PLAN.md §11, §7.1).
 */
import argon2 from 'argon2';
import { prisma } from '../../lib/db.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '@flotilla/shared';
import { randomToken, hashToken } from '../../lib/tokens.js';
import { sendMail } from '../../lib/mailer.js';
import { logger } from '../../lib/logger.js';
import { config } from '../../config.js';
import { createWorkspace, listWorkspacesForActor, ensureUserActor } from '../workspaces/service.js';

const VERIFY_TTL_MIN = 60 * 24;
const RESET_TTL_MIN = 60;
const PASSWORD_OPTS = { type: argon2.argon2id };

// ---------------------------------------------------------------------------
// Serialization (public shapes)
// ---------------------------------------------------------------------------
export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Signup / login / logout
// ---------------------------------------------------------------------------
export async function signUp({ email, name, password, workspaceName }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('An account with that email already exists');

  const passwordHash = await argon2.hash(password, PASSWORD_OPTS);
  const user = await prisma.user.create({ data: { email, name, passwordHash } });

  let workspace = null;
  if (workspaceName) {
    workspace = await createWorkspace({ name: workspaceName, ownerId: user.id });
  } else {
    await ensureUserActor(user.id);
  }

  await startEmailVerification(user.id, email, name);
  return { user, workspace };
}

export async function logIn({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish failure: still hash when user missing to blunt timing probes.
  if (!user || !user.passwordHash) {
    await argon2.hash(password, PASSWORD_OPTS);
    throw new UnauthorizedError('Invalid email or password');
  }
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw new UnauthorizedError('Invalid email or password');
  return user;
}

export function logOut(req) {
  return new Promise((resolve) => req.session.destroy(() => resolve()));
}

export async function updateProfile(userId, { name, avatarUrl }) {
  const data = {};
  if (typeof name === 'string' && name.trim()) data.name = name.trim().slice(0, 100);
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl; // null clears
  const user = await prisma.user.update({ where: { id: userId }, data });
  return user;
}

export async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { actor: true },
  });
  if (!user) throw new UnauthorizedError();
  const workspaces = user.actor ? await listWorkspacesForActor(user.actor.id) : [];
  return { user, workspaces };
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------
export async function startEmailVerification(userId, email, name, purpose = 'verify_email') {
  const token = randomToken(16);
  const ttlMin = purpose === 'verify_email' ? VERIFY_TTL_MIN : RESET_TTL_MIN;
  await prisma.emailToken.create({
    data: {
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMin * 60 * 1000),
    },
  });
  // Mail is fire-and-forget so an SMTP round-trip never gates the response
  // (and never becomes a timing oracle on /forgot-password).
  sendVerificationMail({ email, name, token, purpose }).catch((err) =>
    logger.warn({ err, userId, purpose }, 'failed to send verification email (continuing)'),
  );
  return token;
}

export async function verifyEmail(token) {
  const rec = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || rec.purpose !== 'verify_email') throw new NotFoundError('Invalid verification token');
  if (rec.expiresAt < new Date()) throw new ConflictError('Token expired');
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.emailToken.updateMany({
      where: { id: rec.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) throw new ConflictError('Token already used');
    await tx.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date() } });
  });
}

export async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Don't leak whether the email exists: both branches do comparable work
  // (mail is fire-and-forget; the no-op branch burns an argon2 hash to match
  // the token-INSERT cost of the existing-user branch).
  if (user && user.passwordHash) {
    await startEmailVerification(user.id, email, user.name, 'reset_password');
  } else {
    await argon2.hash(randomToken(16), PASSWORD_OPTS);
  }
}

export async function resetPassword(token, newPassword) {
  const rec = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || rec.purpose !== 'reset_password') throw new NotFoundError('Invalid reset token');
  if (rec.expiresAt < new Date()) throw new ConflictError('Token expired');

  const passwordHash = await argon2.hash(newPassword, PASSWORD_OPTS);
  await prisma.$transaction(async (tx) => {
    // Atomic single-use: only one racing request flips usedAt from null.
    const consumed = await tx.emailToken.updateMany({
      where: { id: rec.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) throw new ConflictError('Token already used or expired');
    await tx.user.update({ where: { id: rec.userId }, data: { passwordHash } });
    // Invalidate ALL of the user's existing sessions (the point of a reset is
    // "lock back down to only me"). connect-pg-simple stores userId in sess JSON.
    await tx.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${rec.userId}`;
  });
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

async function sendVerificationMail({ email, name, token, purpose }) {
  const linkBase = `${config.APP_ORIGIN}`;
  const safeName = escapeHtml(name);
  if (purpose === 'reset_password') {
    const link = `${linkBase}/reset-password?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Reset your Flotilla password',
      text: `Hi ${name || ''},\n\nReset your password: ${link}\n\nThis link expires in ${RESET_TTL_MIN} minutes.`,
      html: `<p>Hi ${safeName},</p><p>Reset your password: <a href="${link}">${link}</a></p><p>Expires in ${RESET_TTL_MIN} minutes.</p>`,
    });
    return;
  }
  const link = `${linkBase}/verify-email?token=${token}`;
  await sendMail({
    to: email,
    subject: 'Verify your Flotilla email',
    text: `Welcome ${name || ''}!\n\nVerify your email: ${link}\n\nThis link expires in ${VERIFY_TTL_MIN} minutes.`,
    html: `<p>Welcome ${safeName}!</p><p>Verify your email: <a href="${link}">${link}</a></p>`,
  });
}
