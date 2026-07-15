/**
 * Computer + pairing routes (PLAN.md §7.1). POST /daemon/pair is unauthenticated
 * (the daemon proves itself with the one-time pairing code).
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import { pairSchema } from '@flotila-org/shared';
import { config } from '../../config.js';
import * as svc from './service.js';

export const router = Router();

// POST /workspaces/:id/computers/pairing-code → { code, serverUrl }
// serverUrl is the origin the daemon should reach the API at (API_ORIGIN), so the
// pairing command works across machines — not just when daemon + server are colocated.
router.post(
  '/workspaces/:id/computers/pairing-code',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const code = svc.createPairingCode(req.workspace.id, req.userId);
    res.json({ code, serverUrl: config.API_ORIGIN });
  }),
);

// POST /daemon/pair { code, name, platform, daemonVersion } → { computerId, deviceToken }
router.post(
  '/daemon/pair',
  validateBody(pairSchema),
  asyncHandler(async (req, res) => {
    const { computer, token } = await svc.pair(req.body.code, {
      name: req.body.name,
      platform: req.body.platform,
      daemonVersion: req.body.daemonVersion,
    });
    res.status(201).json({ computerId: computer.id, deviceToken: token });
  }),
);

// GET /workspaces/:id/computers
router.get(
  '/workspaces/:id/computers',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const list = await svc.listComputers(req.workspace.id);
    res.json({ items: list });
  }),
);

// DELETE /computers/:id  (revoke — daemon disconnects)
router.delete(
  '/computers/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const c = await requireComputerOwnership(req);
    if (!c) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    await svc.revokeComputer(c.workspaceId, c.id);
    res.json({ ok: true });
  }),
);

async function requireComputerOwnership(req) {
  const { prisma } = await import('../../lib/db.js');
  const c = await prisma.computer.findUnique({ where: { id: req.params.id } });
  if (!c) return null;
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId: c.workspaceId, actorId: req.actorId } },
  });
  return member ? c : null;
}
