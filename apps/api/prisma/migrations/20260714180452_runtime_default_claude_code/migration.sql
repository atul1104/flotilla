-- Runtime trim-down: only the `claude-code` adapter remains (mock + codex
-- adapters removed). Flip the column default and rewrite any existing agents
-- still pinned to a removed runtime so they keep working.
ALTER TABLE "agents" ALTER COLUMN "runtime" SET DEFAULT 'claude-code';

-- Re-target removed runtimes to the surviving adapter. Idempotent: a no-op on
-- databases that never had mock/codex/openai-api agents.
UPDATE "agents" SET "runtime" = 'claude-code' WHERE "runtime" IN ('mock', 'codex', 'openai-api');
