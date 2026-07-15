/**
 * claude-code runtime adapter (PLAN.md §8.3). Drives `claude -p --output-format
 * stream-json` with cwd = the agent workspace. The sole runtime adapter; tune the
 * stream-json event mapping against the runtime you pin. E2E tests drive runs via
 * scripted daemon sockets (they don't invoke this adapter), so CI needs no AI keys.
 *
 * Approval gating — BLOCKING via a PreToolUse hook:
 * When the agent's approvalPolicy gates any tool, we install a PreToolUse hook
 * (in <agentDir>/.claude/settings.json) that routes each gated tool call through
 * a per-run UNIX socket back to this adapter. The adapter calls requestApproval()
 * (which posts an approval card over the daemon socket and awaits the human), then
 * returns allow/deny to the hook. Claude Code waits for the hook process to exit
 * before running the tool (600s default), so the tool is genuinely paused until
 * the human decides — and skipped on deny. This retires the old "best-effort card"
 * caveat. The hook helper is ./hook-helper.js.
 *
 * If no policy keys are set, no hook is installed and tools run ungated (same as
 * `claude -p` default).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAgentHome } from '../memory.js';

// tool_use names that the approval policy can gate.
const GATED_TOOLS = {
  Bash: 'requireShellApproval',
  Write: 'requireFileWriteApproval',
  Edit: 'requireFileWriteApproval',
};

const HELPER_PATH = fileURLToPath(new URL('./hook-helper.js', import.meta.url));

/**
 * Install a PreToolUse hook for the gated tool names into the agent's
 * .claude/settings.json. Returns a cleanup fn that restores prior state.
 * Writes only if at least one gated tool is configured.
 */
function installApprovalHook(agentDir, socketPath, gatedNames) {
  if (!gatedNames.length) return () => {};
  const claudeDir = join(agentDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');
  let prior = null;
  if (existsSync(settingsPath)) {
    try {
      prior = readFileSync(settingsPath, 'utf8');
    } catch {
      prior = null;
    }
  }
  const priorJson = prior ? JSON.parse(prior) : {};
  const hookCmd = `node "${HELPER_PATH}" --socket ${socketPath}`;
  const hooks = (priorJson.hooks && Array.isArray(priorJson.hooks.PreToolUse))
    ? priorJson.hooks.PreToolUse.slice()
    : [];
  // Our gate: one matcher covering all gated tools, pointing at the helper.
  hooks.push({
    matcher: gatedNames.join('|'),
    hooks: [{ type: 'command', command: hookCmd }],
  });
  const next = { ...priorJson, hooks: { ...priorJson.hooks, PreToolUse: hooks } };
  writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  return () => {
    if (prior === null) {
      try {
        unlinkSync(settingsPath);
      } catch {
        /* best-effort */
      }
    } else {
      try {
        writeFileSync(settingsPath, prior);
      } catch {
        /* best-effort */
      }
    }
  };
}

export function startClaudeCodeRun({
  agentDir,
  systemPrompt,
  context,
  model,
  approvalPolicy = {},
  onEvent,
  postMessage,
  requestApproval,
}) {
  ensureAgentHome(agentDir);
  let finalStatus = 'succeeded';
  const emit = (type, payload) => onEvent({ type, payload });
  emit('status', { status: 'running' });

  const memory = context?.memory ? `\n\nMemory:\n${context.memory}` : '';
  const prompt = `${systemPrompt ? systemPrompt + '\n\n' : ''}Context:\n${context?.trigger ?? ''}${memory}`;

  // Which tools are gated by policy?
  const gatedNames = Object.keys(GATED_TOOLS).filter((t) => approvalPolicy?.[GATED_TOOLS[t]]);

  // Per-run UNIX socket: the hook helper connects here to ask for a decision.
  const socketPath = join(agentDir, `.approval-${process.pid}.sock`);
  let cleanupHook = () => {};
  const ipcServer = createServer((conn) => {
    let buf = '';
    conn.setEncoding('utf8');
    conn.on('data', async (c) => {
      buf += c;
      if (!buf.includes('\n')) return;
      const line = buf.slice(0, buf.indexOf('\n'));
      buf = buf.slice(buf.indexOf('\n') + 1);
      let req;
      try {
        req = JSON.parse(line);
      } catch {
        conn.write(JSON.stringify({ decision: 'deny', reason: 'bad request' }) + '\n');
        return;
      }
      const { toolName, toolInput } = req;
      emit('tool_use', { name: toolName, input: toolInput });
      // Minimal label — never the full input (Write/Edit carry file contents).
      const label =
        toolName === 'Bash'
          ? String(toolInput?.command ?? '').slice(0, 120)
          : String(toolInput?.file_path ?? toolInput?.path ?? '');
      let decision = 'denied';
      let reason = 'no approval flow';
      if (requestApproval) {
        try {
          decision = await requestApproval({
            action: toolName,
            label: label || undefined,
            risk: toolName === 'Bash' ? 'high' : 'medium',
          });
          reason = decision === 'approved' ? 'approved by human' : 'denied by human';
        } catch (err) {
          reason = String(err?.message || err).slice(0, 120);
        }
      }
      conn.write(JSON.stringify({ decision, reason }) + '\n');
    });
  });
  ipcServer.listen(socketPath);

  cleanupHook = installApprovalHook(agentDir, socketPath, gatedNames);

  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    model || 'claude-sonnet-5',
  ];
  if (gatedNames.length) {
    // manual mode lets our hook be the decision-maker for gated tools.
    args.push('--permission-mode', 'manual', '--include-hook-events');
  }

  const proc = spawn('claude', args, { cwd: agentDir, env: process.env });
  proc.stdin.write(prompt);
  proc.stdin.end();

  let buf = '';
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      mapEvent(evt, { emit, onMessage: postMessage });
    }
  });

  const usage = { tokensIn: 0, tokensOut: 0 };
  const done = new Promise((resolve) => {
    proc.on('close', () => {
      cleanupHook();
      try {
        ipcServer.close();
        unlinkSync(socketPath);
      } catch {
        /* best-effort */
      }
      emit('final', {});
      resolve();
    });
    proc.on('error', () => {
      finalStatus = 'failed';
      emit('status', { status: 'failed' });
      cleanupHook();
      try {
        ipcServer.close();
        unlinkSync(socketPath);
      } catch {
        /* best-effort */
      }
      resolve();
    });
  });

  return {
    cancel: () => {
      finalStatus = 'cancelled';
      proc.kill('SIGTERM');
    },
    done,
    status: () => finalStatus,
    usage: () => usage,
  };
}

function mapEvent(evt, { emit, onMessage }) {
  const t = evt?.type;
  if (t === 'assistant' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === 'text') {
        emit('chunk', { text: block.text });
        onMessage(block.text);
      }
      // tool_use blocks are surfaced+gated by the PreToolUse hook (via the IPC
      // server) before the tool runs, so we don't double-emit here.
    }
  } else if (t === 'tool_result') {
    emit('tool_result', { content: evt.content });
  } else if (t === 'result') {
    if (evt.usage) {
      // best-effort usage capture when the runtime reports it
    }
    if (evt.result) onMessage(String(evt.result));
  }
}
