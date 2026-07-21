/**
 * Realtime layer — Socket.IO namespaces (PLAN.md §7.2, §7.3).
 *
 *  /client (browsers): session-cookie auth; actors join `ws:<workspaceId>` so
 *  broadcasting to a room is tenant-isolated by construction.
 *  /daemon (computers): device-token auth; one socket per computer joins
 *  `computer:<id>`. The server dispatches runs to that room; the daemon streams
 *  run.event/run.message/run.finished back.
 *
 * Persist-first rule (PLAN.md §4): routers write to the DB, THEN broadcast.
 */
import { Server } from 'socket.io';
import { sessionMiddleware } from '../lib/session.js';
import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import {
  CLIENT_SOCKET_EVENTS,
  DAEMON_SOCKET_EVENTS,
  HEARTBEAT,
  GIT_SOCKET_EVENTS,
  gitEventForOperation,
} from '@atul1104/shared';
import { listWorkspacesForActor } from '../modules/workspaces/service.js';
import { markRead } from '../modules/channels/service.js';
import { resolveDeviceToken, markOnline, markOffline } from '../modules/computers/service.js';
import * as runs from '../modules/runs/service.js';

let realtime = null;
const E = CLIENT_SOCKET_EVENTS;
const D = DAEMON_SOCKET_EVENTS;

function wrap(middleware) {
  return (socket, next) => middleware(socket.request, {}, next);
}

export function initRealtime(httpServer, corsOrigin) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin, credentials: true } });

  // ----------------------------- /client -----------------------------
  const clientNs = io.of('/client');
  clientNs.use(wrap(sessionMiddleware()));
  clientNs.use(async (socket, next) => {
    try {
      const userId = socket.request?.session?.userId;
      if (!userId) return next(new Error('unauthorized'));
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { actor: true },
      });
      if (!user?.actor) return next(new Error('unauthorized'));
      socket.data.user = user;
      socket.data.actor = user.actor;
      next();
    } catch (err) {
      next(err);
    }
  });

  clientNs.on('connection', async (socket) => {
    const actor = socket.data.actor;
    const workspaces = await listWorkspacesForActor(actor.id);
    for (const w of workspaces) socket.join(`ws:${w.id}`);
    socket.join(`user:${socket.data.user.id}`, `actor:${actor.id}`);

    socket.on(E.TYPING_START, ({ channelId } = {}) => {
      if (!channelId) return;
      socket.rooms.forEach((room) => {
        if (room.startsWith('ws:')) {
          clientNs
            .to(room)
            .emit(E.TYPING, { channelId, actorId: actor.id, name: socket.data.user.name });
        }
      });
    });
    socket.on(E.CHANNEL_READ, async ({ channelId, messageId } = {}) => {
      if (channelId && messageId) await markRead(channelId, actor.id, messageId).catch(() => {});
    });
  });

  // ----------------------------- /daemon -----------------------------
  const daemonNs = io.of('/daemon');
  daemonNs.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        String(socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
      const computer = await resolveDeviceToken(token);
      if (!computer) return next(new Error('unauthorized'));
      socket.data.computer = computer;
      next();
    } catch (err) {
      next(err);
    }
  });

  daemonNs.on('connection', async (socket) => {
    const computer = socket.data.computer;
    socket.join(`computer:${computer.id}`);

    // Heartbeat: refresh lastSeen; missed HEARTBEAT.MISSED_THRESHOLD → offline.
    const heartbeat = setInterval(() => {
      socket.emit('__heartbeat');
    }, HEARTBEAT.INTERVAL_MS);
    socket.on('__heartbeat', () => markOnline(computer.id).catch(() => {}));

    const guardRun = async (runId) => {
      const run = await prisma.agentRun.findUnique({ where: { id: runId } });
      if (!run || run.computerId !== computer.id) return null;
      return run;
    };

    // Register event handlers synchronously, BEFORE the async presence work
    // below, so a daemon that emits immediately on connect (e.g. a replayed
    // run.message) isn't dropped during the connection-setup awaits.
    socket.on(D.RUN_EVENT, async (data) => {
      if (!(await guardRun(data?.runId))) return;
      await runs
        .ingestEvent(data.runId, data.seq, data.type, data.payload)
        .catch((e) => logger.warn({ err: e }, 'run.event ingest failed'));
    });
    socket.on(D.RUN_MESSAGE, async (data) => {
      if (!(await guardRun(data?.runId))) return;
      await runs
        .postAgentMessage(data.runId, data.content, data.payload)
        .catch((e) => logger.warn({ err: e }, 'run.message failed'));
    });
    socket.on(D.RUN_FINISHED, async (data) => {
      if (!(await guardRun(data?.runId))) return;
      await runs
        .finishRun(data.runId, data.status, data.usage, data.error)
        .catch((e) => logger.warn({ err: e }, 'run.finished failed'));
    });

    socket.on('disconnect', async () => {
      clearInterval(heartbeat);
      await markOffline(computer.id).catch(() => {});
      await prisma.agent
        .updateMany({ where: { computerId: computer.id }, data: { status: 'offline' } })
        .catch(() => {});
      clientNs.to(`ws:${computer.workspaceId}`).emit(E.COMPUTER_STATUS, {
        computerId: computer.id,
        status: 'offline',
      });
      logger.info({ computerId: computer.id }, 'daemon disconnected');
    });

    // Presence: mark the computer online + bring its agents' status in line.
    await markOnline(computer.id, {
      platform: socket.handshake.auth?.platform,
      daemonVersion: socket.handshake.auth?.daemonVersion,
    });
    const agents = await prisma.agent.findMany({ where: { computerId: computer.id } });
    for (const a of agents) {
      await prisma.agent.update({ where: { id: a.id }, data: { status: 'idle' } }).catch(() => {});
    }
    clientNs.to(`ws:${computer.workspaceId}`).emit(E.COMPUTER_STATUS, {
      computerId: computer.id,
      status: 'online',
    });
    // Pick up runs that queued while the computer was offline (PLAN.md §8.5).
    runs
      .dispatchQueuedForComputer(computer.id)
      .catch((e) => logger.warn({ err: e }, 'queued-run re-dispatch failed'));
    logger.info({ computerId: computer.id }, 'daemon connected');
  });

  realtime = {
    io,
    clientNs,
    daemonNs,
    // /client broadcasts (tenant-isolated via ws:<id> room)
    broadcastMessage(workspaceId, channelId, message, mentionedActorIds = []) {
      clientNs
        .to(`ws:${workspaceId}`)
        .emit(E.MESSAGE_CREATED, { channelId, message, mentionedActorIds });
    },
    broadcastMessageUpdate(workspaceId, channelId, message) {
      clientNs.to(`ws:${workspaceId}`).emit(E.MESSAGE_UPDATED, { channelId, message });
    },
    broadcastMessageDelete(workspaceId, channelId, messageId) {
      clientNs.to(`ws:${workspaceId}`).emit(E.MESSAGE_DELETED, { channelId, messageId });
    },
    broadcastReaction(workspaceId, channelId, payload) {
      clientNs.to(`ws:${workspaceId}`).emit(E.REACTION_ADDED, { channelId, ...payload });
    },
    broadcastChannel(workspaceId, channel) {
      clientNs.to(`ws:${workspaceId}`).emit(E.CHANNEL_CREATED, { channel });
    },
    broadcastTask(workspaceId, task, kind = 'created') {
      clientNs
        .to(`ws:${workspaceId}`)
        .emit(kind === 'created' ? E.TASK_CREATED : E.TASK_UPDATED, { task });
    },
    broadcastRunEvent(workspaceId, event) {
      clientNs.to(`ws:${workspaceId}`).emit(E.RUN_EVENT, event);
    },
    broadcastRunLifecycle(workspaceId, run, kind) {
      clientNs
        .to(`ws:${workspaceId}`)
        .emit(kind === 'started' ? E.RUN_STARTED : E.RUN_FINISHED, { run });
    },
    broadcastAgentStatus(workspaceId, agentId, status) {
      clientNs.to(`ws:${workspaceId}`).emit(E.AGENT_STATUS, { agentId, status });
    },
    // Phase 8+ — Git collaboration: broadcast a recorded Git operation. Emits a
    // typed event (branch.created / commit.pushed / pr.opened / …) the dashboard
    // can switch on, plus the generic operation.recorded.
    broadcastGitOperation(workspaceId, op) {
      const typed = gitEventForOperation(op.operation, op.status);
      clientNs.to(`ws:${workspaceId}`).emit(typed, { op });
      clientNs.to(`ws:${workspaceId}`).emit(GIT_SOCKET_EVENTS.OPERATION_RECORDED, { op });
    },
    broadcastApproval(workspaceId, approval, kind) {
      clientNs
        .to(`ws:${workspaceId}`)
        .emit(kind === 'requested' ? E.APPROVAL_REQUESTED : E.APPROVAL_DECIDED, { approval });
    },
    // Phase 6 — per-user notification (delivered only to that user's sockets).
    broadcastNotification(userId, notification) {
      clientNs.to(`user:${userId}`).emit(E.NOTIFICATION_CREATED, { notification });
    },
    // /daemon dispatch (one computer per room)
    dispatchRun(computerId, context) {
      daemonNs.to(`computer:${computerId}`).emit(D.RUN_DISPATCH, context);
    },
    cancelRun(computerId, runId) {
      daemonNs.to(`computer:${computerId}`).emit(D.RUN_CANCEL, { runId });
    },
    sendApprovalDecision(computerId, runId, approvalId, decision) {
      daemonNs
        .to(`computer:${computerId}`)
        .emit(D.APPROVAL_DECISION, { runId, approvalId, decision });
    },
  };

  return realtime;
}

export function getRealtime() {
  return realtime;
}
