/**
 * Workspace membership middleware. Loads the workspace from :workspaceSlug or
 * :workspaceId (or :id), verifies the current actor is a member, and attaches
 * `req.workspace` + `req.membership`. This is tenant isolation — the #1 bug
 * class in chat apps (PLAN.md §11, §13). Test it explicitly.
 */
import { ForbiddenError, NotFoundError } from '@flotilla/shared';
import { prisma } from '../lib/db.js';
import { ROLE_RANK, WORKSPACE_ROLE } from '@flotilla/shared';
import { asyncHandler } from '../lib/asyncHandler.js';

function resolveId(req) {
  return req.params.workspaceSlug || req.params.workspaceId || req.params.id;
}

export const requireWorkspaceMember = asyncHandler(async (req, _res, next) => {
  const key = resolveId(req);
  if (!key) return next(new NotFoundError('Workspace not specified'));

  // Match on slug (citext-like, pre-lowercased) OR uuid.
  const where = /^[0-9a-f-]{36}$/i.test(key) ? { id: key } : { slug: String(key).toLowerCase() };

  const workspace = await prisma.workspace.findFirst({ where });
  if (!workspace) return next(new NotFoundError('Workspace not found'));

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId: workspace.id, actorId: req.actorId } },
  });
  if (!membership) return next(new ForbiddenError('Not a member of this workspace'));

  req.workspace = workspace;
  req.membership = membership;
  next();
});

/** Require at least the given workspace role (PLAN.md §6 roles). */
export const requireRole = (minRole) =>
  asyncHandler(async (req, _res, next) => {
    const role = req.membership?.role ?? WORKSPACE_ROLE.MEMBER;
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return next(new ForbiddenError(`Requires ${minRole} role`));
    }
    next();
  });
