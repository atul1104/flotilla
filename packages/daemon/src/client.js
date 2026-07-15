/**
 * Daemon client: connects to the /daemon namespace, receives run.dispatch,
 * spawns the right runtime adapter, and streams events/messages/finish back.
 * (PLAN.md §8.1, §8.5).
 *
 * Phase 5:
 *  - Owns the per-run event seq (adapters + the approval gate share one counter
 *    so server-side (runId,seq) dedupe never collides).
 *  - Loads the agent's AGENT.md/MEMORY.md into the run context and appends a run
 *    log at finish (PLAN.md §8.2).
 *  - Provides adapters a `requestApproval(action)` that posts an approval card
 *    via an `approval_request` event and resolves with the human's decision when
 *    the server relays `approval.decision` (improvement #3).
 */
import { io } from 'socket.io-client';
import { DAEMON_SOCKET_EVENTS as D } from './socket-events.js';
import { agentDir } from './config.js';
import { startClaudeCodeRun } from './adapters/claude-code.js';
import { ensureAgentHome, loadMemory, syncAgentDoc, appendRunLog } from './memory.js';

const ADAPTERS = {
  'claude-code': startClaudeCodeRun,
};

export function startDaemon({ serverUrl, token, platform, daemonVersion, name }) {
  const sock = io(`${serverUrl}/daemon`, {
    transports: ['websocket'],
    auth: { token, platform, daemonVersion, name },
    reconnection: true,
  });
  const active = new Map(); // runId -> handle
  const pendingApprovals = new Map(); // runId -> { resolve }

  sock.on('connect', () => log(`connected to ${serverUrl} as ${name || 'computer'}`));
  sock.on('disconnect', (reason) => log(`disconnected (${reason}); reconnecting…`));
  sock.on('connect_error', (err) => log(`connection error: ${err.message}`));

  // Server relays a human's approve/deny → resolve the adapter's requestApproval.
  sock.on(D.APPROVAL_DECISION, ({ runId, decision } = {}) => {
    const p = pendingApprovals.get(runId);
    if (p) {
      pendingApprovals.delete(runId);
      p.resolve(decision);
    }
  });

  sock.on(D.RUN_DISPATCH, async (ctx) => {
    const { runId, agent, context } = ctx || {};
    if (!runId || !agent) return;
    log(
      `▶ run.dispatch @${agent.handle} (${agent.runtime}) — "${String(context?.trigger || '').slice(0, 60)}"`,
    );

    const dir = agentDir(agent.handle);
    ensureAgentHome(dir);
    syncAgentDoc(dir, agent.systemPrompt);
    const { memory } = loadMemory(dir);

    const factory = ADAPTERS[agent.runtime] || startClaudeCodeRun;
    let seq = 0;
    const nextSeq = () => ++seq;
    const onEvent = (e) =>
      sock.emit(D.RUN_EVENT, { runId, seq: nextSeq(), type: e.type, payload: e.payload });
    const postMessage = (content, payload) => sock.emit(D.RUN_MESSAGE, { runId, content, payload });

    // Human-in-the-loop gate: ask the server to post a card, await the decision.
    const requestApproval = (action) => {
      const payload =
        typeof action === 'string'
          ? { action }
          : { action: 'tool', label: String(action), ...action };
      onEvent({ type: 'approval_request', payload });
      return new Promise((resolve) => pendingApprovals.set(runId, { resolve }));
    };

    let status = 'succeeded';
    try {
      const handle = factory({
        agentDir: dir,
        systemPrompt: agent.systemPrompt,
        context: { ...context, memory },
        model: agent.model,
        approvalPolicy: agent.approvalPolicy,
        onEvent,
        postMessage,
        requestApproval,
      });
      active.set(runId, handle);
      if (handle.done) await handle.done;
      if (typeof handle.status === 'function') status = handle.status();
    } catch (err) {
      status = 'failed';
      log(`run ${runId} failed: ${err.message}`);
    } finally {
      active.delete(runId);
      pendingApprovals.delete(runId);
    }

    sock.emit(D.RUN_FINISHED, {
      runId,
      status,
      usage: factory.usage ? factory.usage() : undefined,
    });
    // Durable run log (PLAN.md §8.2) — the append-only memory of what happened.
    const trigger = String(context?.trigger || '')
      .slice(0, 80)
      .replace(/\s+/g, ' ');
    appendRunLog(dir, `- [${new Date().toISOString()}] run ${status} — ${trigger}`);
  });

  sock.on(D.RUN_CANCEL, ({ runId } = {}) => {
    const handle = active.get(runId);
    if (handle) {
      handle.cancel?.();
      log(`■ run.cancel ${runId}`);
    }
  });

  return sock;
}

function log(...args) {
  console.log(`[flotilla-daemon]`, ...args);
}
