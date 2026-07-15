/**
 * Auth middleware. Session-backed (PLAN.md §11). Attaches the current user +
 * actor to the request. Role gating lives in workspace.js (needs membership).
 */
import { UnauthorizedError } from '@atul1104/shared';
import { prisma } from '../lib/db.js';
import { asyncHandler } from '../lib/asyncHandler.js';

/** Attach user/actor if logged in; never throws. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const userId = req.session?.userId;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { actor: true },
    });
    if (user?.actor) {
      req.user = user;
      req.userId = user.id;
      req.actor = user.actor;
      req.actorId = user.actor.id;
    }
  }
  next();
});

/** Require an authenticated session. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  if (!req.session?.userId) return next(new UnauthorizedError('Not authenticated'));
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    include: { actor: true },
  });
  if (!user?.actor) {
    // Stale session referencing a deleted user.
    req.session.destroy(() => {});
    return next(new UnauthorizedError('Not authenticated'));
  }
  req.user = user;
  req.userId = user.id;
  req.actor = user.actor;
  req.actorId = user.actor.id;
  next();
});
