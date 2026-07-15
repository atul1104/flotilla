/**
 * Workspace routes — /api/v1/workspaces/* and /api/v1/invites/* (PLAN.md §7.1).
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember, requireRole } from '../../middleware/workspace.js';
import { getOnboarding } from './onboarding.js';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  createInviteSchema,
  acceptInviteSchema,
} from '@atul1104/shared';
import { WORKSPACE_ROLE } from '@atul1104/shared';
import * as ws from './service.js';
import { sendMail } from '../../lib/mailer.js';
import { config } from '../../config.js';
import { loginUserSession } from '../../lib/sessionAuth.js';

/** HTML-escape a string for safe interpolation into email HTML bodies. */
export function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export const router = Router();

function toWorkspace(w) {
  return {
    id: w.id,
    slug: w.slug,
    name: w.name,
    plan: w.plan,
    settings: w.settings,
    createdAt: w.createdAt,
  };
}

function toMember(m) {
  const u = m.actor?.user;
  const agent = m.actor?.agent; // present for agent members (Phase 4+)
  return {
    actorId: m.actorId,
    kind: m.actor?.kind,
    role: m.role,
    userId: u?.id ?? null,
    // Agents surface their display name + @handle so the mention autocomplete
    // and the handoff target picker can offer them alongside humans.
    name: u?.name ?? agent?.name ?? null,
    handle: agent?.handle ?? null,
    email: u?.email ?? null,
    avatarUrl: u?.avatarUrl ?? agent?.avatarUrl ?? null,
    joinedAt: m.joinedAt,
  };
}

// POST /workspaces — create
router.post(
  '/',
  requireAuth,
  validateBody(createWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const workspace = await ws.createWorkspace({
      name: req.body.name,
      slug: req.body.slug,
      ownerId: req.userId,
    });
    res.status(201).json(toWorkspace(workspace));
  }),
);

// GET /workspaces — list the current user's workspaces
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await ws.listWorkspacesForActor(req.actorId);
    res.json({ items: list.map(toWorkspace) });
  }),
);

// GET /workspaces/:id
router.get('/:id', requireAuth, requireWorkspaceMember, (req, res) => {
  res.json(toWorkspace(req.workspace));
});

// PATCH /workspaces/:id (admin+)
router.patch(
  '/:id',
  requireAuth,
  requireWorkspaceMember,
  requireRole(WORKSPACE_ROLE.ADMIN),
  validateBody(updateWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const updated = await ws.updateWorkspace(req.workspace, req.body);
    res.json(toWorkspace(updated));
  }),
);

// GET /workspaces/:id/members
router.get(
  '/:id/members',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const members = await ws.listMembers(req.workspace.id);
    res.json({ items: members.map(toMember) });
  }),
);

// GET /workspaces/:id/onboarding — funnel state (Phase 8)
router.get(
  '/:id/onboarding',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    res.json(await getOnboarding(req.workspace.id));
  }),
);

// POST /workspaces/:id/invites (admin+)
router.post(
  '/:id/invites',
  requireAuth,
  requireWorkspaceMember,
  requireRole(WORKSPACE_ROLE.ADMIN),
  validateBody(createInviteSchema),
  asyncHandler(async (req, res) => {
    const { invite, token } = await ws.createInvite({
      workspaceId: req.workspace.id,
      email: req.body.email,
      role: req.body.role,
      invitedByUserId: req.userId,
    });
    const link = `${config.APP_ORIGIN}/invite/${token}`;
    // Best-effort invite email (don't fail the request if mail is unreachable).
    // HTML-escape user-controlled workspace name to prevent markup injection.
    const wsName = escapeHtml(req.workspace.name);
    try {
      await sendMail({
        to: req.body.email,
        subject: `You're invited to ${req.workspace.name} on Flotilla`,
        text: `You've been invited to join ${req.workspace.name}.\n\nAccept: ${link}\n\nThis invite expires in 7 days.`,
        html: `<p>You've been invited to join <strong>${wsName}</strong>.</p><p><a href="${link}">Accept invite</a></p>`,
      });
    } catch {
      /* mail optional */
    }
    res
      .status(201)
      .json({ invite: { id: invite.id, email: invite.email, role: invite.role }, link });
  }),
);

// --- invites router (mounted at /api/v1/invites) ---

export const invitesRouter = Router();

// POST /invites/:token/accept — logged-in user (recipient) accepts, or a new
// user signs up inline. Recipient-bound + session-rotated (PLAN.md §11).
invitesRouter.post(
  '/:token/accept',
  optionalAuth,
  validateBody(acceptInviteSchema),
  asyncHandler(async (req, res) => {
    if (req.userId) {
      const result = await ws.acceptInviteAuthenticated({
        token: req.params.token,
        actorEmail: req.user.email,
      });
      await loginUserSession(req, result.user.id);
      return res.json({ ok: true, workspaceId: result.workspaceId });
    }
    // Anonymous: sign up. Schema guarantees password min 12 + name.
    if (!req.body.password || !req.body.name) {
      return res.status(400).json({
        error: 'name and password required to accept this invite',
        code: 'VALIDATION_ERROR',
      });
    }
    const argon2 = (await import('argon2')).default;
    const passwordHash = await argon2.hash(req.body.password);
    const result = await ws.signUpViaInvite({
      token: req.params.token,
      name: req.body.name,
      passwordHash,
    });
    await loginUserSession(req, result.user.id);
    res.status(201).json({ ok: true, workspaceId: result.workspaceId });
  }),
);

// GET /invites/:token — preview before accepting. Does NOT return the invited
// email (PII); the invitee already knows their own address.
invitesRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const invite = await ws.getInviteByToken(req.params.token);
    const workspace = await ws.getWorkspace(invite.workspaceId);
    res.json({
      workspaceName: workspace?.name ?? null,
      workspaceSlug: workspace?.slug ?? null,
      role: invite.role,
    });
  }),
);
