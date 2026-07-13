-- Agent.runtime: store the wire value (e.g. "claude-code", "openai-api") as TEXT
-- instead of a Prisma enum. Prisma enum values can't contain hyphens, but the
-- app/daemon wire format is hyphenated (RUNTIME.CLAUDE_CODE = "claude-code",
-- ADAPTERS keyed by "claude-code"), so a String column is the single source of
-- truth. Existing values ("mock") are preserved by the USING cast.
ALTER TABLE "agents" ALTER COLUMN "runtime" TYPE TEXT USING "runtime"::text;
ALTER TABLE "agents" ALTER COLUMN "runtime" SET DEFAULT 'mock';

-- DropEnum: the "Runtime" enum is no longer used.
DROP TYPE "Runtime";
