/**
 * Agent home + memory conventions (PLAN.md §8.2). The daemon is the source of
 * truth for an agent's working files and memory — these never transit the server
 * unless the agent posts them as a message. v1 memory is deliberately simple:
 *
 *   ~/.flotilla/agents/<handle>/
 *   ├─ AGENT.md     identity + standing instructions (synced from server prompt)
 *   ├─ MEMORY.md    long-term memory the agent maintains itself
 *   ├─ notes/       scratch files kept between runs
 *   └─ workspace/   working dir (repos, artifacts) — the runtime's cwd
 *
 * At run start we ensure the home exists, read AGENT.md + MEMORY.md, and feed
 * them into the run context. At run end we append a one-line run log to
 * MEMORY.md so the agent has a durable, append-only history of what it did. Real
 * runtimes (claude-code) can additionally rewrite MEMORY.md themselves via cwd.
 */
import { mkdirSync, existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function ensureAgentHome(agentDir) {
  mkdirSync(join(agentDir, 'notes'), { recursive: true });
  mkdirSync(join(agentDir, 'workspace'), { recursive: true });
  return agentDir;
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** Load AGENT.md + MEMORY.md (empty strings when absent) for the run context. */
export function loadMemory(agentDir) {
  return {
    agent: readIfExists(join(agentDir, 'AGENT.md')).trim(),
    memory: readIfExists(join(agentDir, 'MEMORY.md')).trim(),
  };
}

/**
 * Seed AGENT.md from the server-synced system prompt when missing, so the
 * agent's standing instructions live on disk alongside its memory.
 */
export function syncAgentDoc(agentDir, systemPrompt) {
  const p = join(agentDir, 'AGENT.md');
  if (systemPrompt && !existsSync(p)) writeFileSync(p, `# Agent\n\n${systemPrompt}\n`);
}

/** Append a durable, append-only run log line to MEMORY.md. */
export function appendRunLog(agentDir, line) {
  appendFileSync(join(agentDir, 'MEMORY.md'), `${line}\n`);
}

/** Overwrite MEMORY.md (used when a runtime emits an explicit memory update). */
export function writeMemory(agentDir, content) {
  writeFileSync(join(agentDir, 'MEMORY.md'), content);
}
