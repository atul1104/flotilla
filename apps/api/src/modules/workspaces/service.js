/**
 * Workspace business logic. Create/update workspaces, members, invites.
 * Services are unit-testable; routers stay thin (PLAN.md §5).
 */
import { prisma } from '../../lib/db.js';
import { ConflictError, NotFoundError, ForbiddenError } from '@flotilla/shared';
import { WORKSPACE_ROLE, CHANNEL_KIND } from '@flotilla/shared';
import { slugify, uniqueSlug } from '../../lib/slug.js';
import { randomToken, hashToken } from '../../lib/tokens.js';

const DEFAULT_CHANNEL = 'general';

/** Get-or-create the actor for a user (a user has exactly one actor). */
export async function ensureUserActor(userId, tx = prisma) {
  const existing = await tx.actor.findUnique({ where: { userId } });
  if (existing) return existing;
  return tx.actor.create({ data: { kind: 'user', userId } });
}

/** Create a workspace: owner membership + a default #general channel they're in. */
export async function createWorkspace({ name, slug, ownerId }) {
  const base = slugify(slug || name);
  const finalSlug = await uniqueSlug(base, (s) =>
    prisma.workspace.findUnique({ where: { slug: s } }).then(Boolean),
  );

  return prisma.$transaction(async (tx) => {
    const actor = await ensureUserActor(ownerId, tx);
    const workspace = await tx.workspace.create({
      data: { name, slug: finalSlug, ownerId, plan: 'free', settings: {} },
    });
    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, actorId: actor.id, role: WORKSPACE_ROLE.OWNER },
    });
    const general = await tx.channel.create({
      data: {
        workspaceId: workspace.id,
        name: DEFAULT_CHANNEL,
        topic: 'Company-wide announcements and chatter',
        kind: CHANNEL_KIND.PUBLIC,
        createdById: actor.id,
      },
    });
    await tx.channelMember.create({
      data: { channelId: general.id, actorId: actor.id },
    });
    return tx.workspace.findUnique({ where: { id: workspace.id } });
  });
}

export async function listWorkspacesForActor(actorId) {
  const rows = await prisma.workspaceMember.findMany({
    where: { actorId },
    include: { workspace: true },
    orderBy: { joinedAt: 'asc' },
  });
  return rows.map((r) => r.workspace);
}

export async function getWorkspace(byKey) {
  const where = /^[0-9a-f-]{36}$/i.test(byKey)
    ? { id: byKey }
    : { slug: String(byKey).toLowerCase() };
  return prisma.workspace.findFirst({ where });
}

export async function updateWorkspace(workspace, patch) {
  const data = { ...patch };
  if (patch.name && !patch.settings) data.settings = workspace.settings;
  return prisma.workspace.update({ where: { id: workspace.id }, data });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
export async function listMembers(workspaceId) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      actor: { include: { user: true, agent: true } },
    },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  });
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------
const INVITE_TTL_DAYS = 7;

export async function createInvite({ workspaceId, email, role, invitedByUserId }) {
  const token = randomToken(16);
  const invite = await prisma.invite.create({
    data: {
      workspaceId,
      email: email.toLowerCase(),
      role: role === 'admin' ? 'admin' : WORKSPACE_ROLE.MEMBER,
      token: hashToken(token),
      invitedBy: invitedByUserId,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return { invite, token }; // token returned once (call site sends the link)
}

export async function getInviteByToken(token) {
  const invite = await prisma.invite.findUnique({ where: { token: hashToken(token) } });
  if (!invite) throw new NotFoundError('Invite not found or invalid');
  if (invite.acceptedAt) throw new ConflictError('Invite already used');
  if (invite.expiresAt < new Date()) throw new ConflictError('Invite expired');
  return invite;
}

/**
 * Atomically consume an invite inside a transaction. The conditional
 * updateMany (WHERE accepted_at IS NULL AND expires_at > now) serializes
 * concurrent consumers under READ COMMITTED; count===0 means we lost the race.
 */
async function consumeInvite(tx, inviteId) {
  const consumed = await tx.invite.updateMany({
    where: { id: inviteId, acceptedAt: null, expiresAt: { gt: new Date() } },
    data: { acceptedAt: new Date() },
  });
  if (consumed.count === 0) throw new ConflictError('Invite already used or expired');
}

/** Add an actor to a workspace + #general. Never mutates an existing member's
 *  role (an invite must not silently downgrade/escalate an existing member). */
async function addActorToWorkspace(tx, { workspaceId, actorId, role }) {
  const existing = await tx.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId, actorId } },
  });
  if (existing) return; // already a member — do not touch their role
  await tx.workspaceMember.create({ data: { workspaceId, actorId, role } });
  const general = await tx.channel.findFirst({ where: { workspaceId, name: DEFAULT_CHANNEL } });
  if (general) {
    await tx.channelMember.upsert({
      where: { channelId_actorId: { channelId: general.id, actorId } },
      update: {},
      create: { channelId: general.id, actorId },
    });
  }
}

/**
 * Logged-in user accepts: MUST be the invited recipient (email match). The
 * recipient binding prevents a leaked token from granting its role to any
 * other logged-in account.
 */
export async function acceptInviteAuthenticated({ token, actorEmail }) {
  const invite = await getInviteByToken(token);
  if (String(actorEmail || '').toLowerCase() !== String(invite.email).toLowerCase()) {
    throw new ForbiddenError('This invite is for a different email address');
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: invite.email } });
    if (!user) throw new NotFoundError('Create your account first, then accept this invite');
    const actor = await ensureUserActor(user.id, tx);
    await addActorToWorkspace(tx, {
      workspaceId: invite.workspaceId,
      actorId: actor.id,
      role: invite.role,
    });
    await consumeInvite(tx, invite.id);
    return { user, workspaceId: invite.workspaceId };
  });
}

/**
 * Anonymous new-user signup via invite. NEVER resolves to an existing account
 * (closes the pre-auth account-takeover via invite): if the invited email is
 * already registered, the caller is forced onto the logged-in accept path
 * where session ownership is proven.
 */
export async function signUpViaInvite({ token, name, passwordHash }) {
  const invite = await getInviteByToken(token);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: invite.email } });
    if (existing) throw new ConflictError('Account exists — log in first to accept this invite.');
    const user = await tx.user.create({
      data: { email: invite.email, name: name || invite.email.split('@')[0], passwordHash },
    });
    const actor = await ensureUserActor(user.id, tx);
    await addActorToWorkspace(tx, {
      workspaceId: invite.workspaceId,
      actorId: actor.id,
      role: invite.role,
    });
    await consumeInvite(tx, invite.id);
    return { user, workspaceId: invite.workspaceId };
  });
}
