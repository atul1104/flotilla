/**
 * claude-code runtime adapter (PLAN.md §8.3). Drives `claude -p --output-format
 * stream-json` with cwd = the agent workspace, mapping its permission callback
 * to requestApproval (improvement #3).
 *
 * NOTE: requires the `claude` CLI on PATH (and valid credentials). The mock
 * adapter is the tested path; this is wired but exercised manually. Tune the
 * stream-json event mapping against the runtime you pin.
 *
 * Approval gating: with the `-p` headless CLI the subprocess is non-interactive,
 * so a true block-and-ask gate needs the Claude Agent SDK's `canUseTool` hook
 * (planned follow-up). Here we surface gated tool_use events as approval cards
 * via requestApproval so the human sees them in-thread; the SDK hook will make
 * the decision actually block the tool when wired.
 */
import { spawn } from 'node:child_process';
import { ensureAgentHome } from '../memory.js';

// tool_use names that the approval policy can gate.
const GATED_TOOLS = {
  Bash: 'requireShellApproval',
  Write: 'requireFileWriteApproval',
  Edit: 'requireFileWriteApproval',
};

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
  let acc = '';

  const proc = spawn(
    'claude',
    ['-p', '--output-format', 'stream-json', '--model', model || 'claude-sonnet-5'],
    { cwd: agentDir, env: process.env },
  );
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
      mapEvent(evt, {
        emit,
        approvalPolicy,
        requestApproval,
        onChunk: (t) => (acc += t),
        onMessage: postMessage,
      });
    }
  });

  const usage = { tokensIn: 0, tokensOut: 0 };
  const done = new Promise((resolve) => {
    proc.on('close', () => {
      emit('final', {});
      resolve();
    });
    proc.on('error', () => {
      finalStatus = 'failed';
      emit('status', { status: 'failed' });
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

function mapEvent(evt, { emit, approvalPolicy, requestApproval, onChunk, onMessage }) {
  const t = evt?.type;
  if (t === 'assistant' && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === 'text') {
        emit('chunk', { text: block.text });
        onChunk(block.text);
      } else if (block.type === 'tool_use') {
        emit('tool_use', { name: block.name, input: block.input });
        // Improvement #3 — if this tool is gated by policy, surface an approval
        // card. The label carries ONLY a minimal descriptor (command text or a
        // file path) — never the full tool input, which for Write/Edit includes
        // file *contents* (and could exfiltrate secrets into the chat card).
        // (SDK `canUseTool` will make the decision actually block — file note.)
        const policyKey = GATED_TOOLS[block.name];
        if (policyKey && approvalPolicy?.[policyKey] && requestApproval) {
          const label =
            block.name === 'Bash'
              ? String(block.input?.command ?? '').slice(0, 120)
              : String(block.input?.file_path ?? block.input?.path ?? '');
          requestApproval({
            action: `${block.name}`,
            label: label || undefined,
            risk: block.name === 'Bash' ? 'high' : 'medium',
          }).catch(() => {});
        }
      }
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
