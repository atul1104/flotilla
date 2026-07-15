#!/usr/bin/env node
/**
 * PreToolUse hook helper for the claude-code adapter's blocking approval gate.
 * Claude Code spawns this as a subprocess before each gated tool call (configured
 * via .claude/settings.json). It:
 *   1. reads Claude's hook payload ({tool_name, tool_input, ...}) from stdin,
 *   2. connects to the adapter's per-run UNIX socket (path in --socket),
 *   3. sends the tool request and awaits the human's allow/deny decision,
 *   4. prints Claude's decision JSON to stdout and exits 0.
 *
 * The adapter (in the daemon process) owns requestApproval() — it posts the
 * approval card over the daemon socket and resolves when the human decides.
 * Claude blocks the tool the whole time this process is alive (600s default).
 *
 * Fail-closed: on any error talking to the adapter, deny. Never hang Claude.
 *
 * This file is invoked by path (the hook command is `node <abs-path> --socket <p>`),
 * so it must be plain Node with no imports from the package graph.
 */
import { createConnection } from 'node:net';
import { argv, exit, stdin, stdout } from 'node:process';

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (c) => (buf += c));
    stdin.on('end', () => resolve(buf));
    // Claude always sends a finite payload; no timeout needed here — the adapter
    // side bounds the wait.
  });
}

function decide(permissionDecision, reason) {
  stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason: reason,
      },
    }),
  );
  exit(0);
}

const socketPath = (() => {
  const i = argv.indexOf('--socket');
  return i >= 0 ? argv[i + 1] : null;
})();

async function main() {
  if (!socketPath) {
    decide('deny', 'approval hook misconfigured: no --socket path');
    return;
  }

  const payload = await readStdin();
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    decide('deny', 'could not parse hook payload');
    return;
  }

  const toolName = parsed.tool_name ?? 'unknown';
  const toolInput = parsed.tool_input ?? {};

  // Ask the adapter. Fail-closed on any connection/timeout error.
  const decision = await new Promise((resolve) => {
    const sock = createConnection(socketPath, () => {
      sock.write(JSON.stringify({ toolName, toolInput }) + '\n');
    });
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (c) => {
      buf += c;
      if (buf.includes('\n')) {
        sock.end();
        try {
          resolve(JSON.parse(buf.trim()));
        } catch {
          resolve({ decision: 'deny', reason: 'bad reply from adapter' });
        }
      }
    });
    sock.on('error', () => resolve({ decision: 'deny', reason: 'cannot reach approval adapter' }));
    // Safety bound — if the adapter vanishes, don't let Claude hang forever.
    setTimeout(() => {
      sock.destroy();
      resolve({ decision: 'deny', reason: 'approval timed out' });
    }, 590_000).unref();
  });

  decide(
    decision?.decision === 'approved' ? 'allow' : 'deny',
    decision?.reason || (decision?.decision === 'approved' ? 'approved by human' : 'denied by human'),
  );
}

main();
