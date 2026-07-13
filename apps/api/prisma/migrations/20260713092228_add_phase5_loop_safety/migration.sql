-- Phase 5: multi-agent loop safety (PLAN.md §8.4)
-- chain_depth counts agent→agent triggers (0 = direct human/schedule trigger);
-- parent_run_id is the run that handed off to this one; trigger names the source.

-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "chain_depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parent_run_id" UUID,
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'mention';

-- CreateIndex
CREATE INDEX "agent_runs_parent_run_id_idx" ON "agent_runs"("parent_run_id");
