/** ~/.flotilla daemon config (PLAN.md §8.1). Stores the device token + server URL. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = join(homedir(), '.flotilla');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(patch) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const next = { ...readConfig(), ...patch };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** ~/.flotilla/agents/<handle>/ — agent home + memory (PLAN.md §8.2). */
export function agentDir(handle) {
  return join(CONFIG_DIR, 'agents', String(handle || 'default'));
}
