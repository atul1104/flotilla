-- Git Integration for Team Collaboration (Phase 8+)
-- Add GitHub integration fields to agents for Git-based collaboration workflow
-- Add Git operation tracking table
-- Add GitHub fields to tasks for repository integration

-- Add Git integration fields to agents
ALTER TABLE "agents"
  ADD COLUMN "github_token_encrypted" TEXT,
  ADD COLUMN "default_repo_url" TEXT,
  ADD COLUMN "default_branch" TEXT DEFAULT 'main',
  ADD COLUMN "git_workflow" TEXT,
  ADD COLUMN "collaboration_mode" TEXT;

-- Add Git fields to tasks for repository integration
ALTER TABLE "tasks"
  ADD COLUMN "github_repo" TEXT,
  ADD COLUMN "base_branch" TEXT,
  ADD COLUMN "feature_branch" TEXT,
  ADD COLUMN "pull_request_url" TEXT,
  ADD COLUMN "git_status" JSONB;

-- Create Git operations tracking table
CREATE TABLE "git_operations" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "agent_id" UUID NOT NULL,
    "task_id" UUID,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "branch" TEXT,
    "commit_hash" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes for Git operations
CREATE INDEX "git_operations_agent_id_status_idx" ON "git_operations"("agent_id", "status");
CREATE INDEX "git_operations_task_id_idx" ON "git_operations"("task_id");

-- Add comments for documentation
COMMENT ON TABLE "git_operations" IS 'Tracks Git operations performed by agents for team collaboration workflow';
COMMENT ON COLUMN "git_operations"."operation" IS 'Type of Git operation: clone, pull, push, commit, branch, pr, merge';
COMMENT ON COLUMN "git_operations"."status" IS 'Operation status: pending, success, failed';
COMMENT ON COLUMN "agents"."github_token_encrypted" IS 'Encrypted GitHub token for Git operations';
COMMENT ON COLUMN "agents"."default_repo_url" IS 'Default GitHub repository URL for the agent';
COMMENT ON COLUMN "agents"."git_workflow" IS 'Git workflow strategy: feature-branch, trunk-based, etc.';
COMMENT ON COLUMN "agents"."collaboration_mode" IS 'Agent collaboration mode: autonomous, supervised, interactive, manual';
COMMENT ON COLUMN "tasks"."github_repo" IS 'GitHub repository URL for this task';
COMMENT ON COLUMN "tasks"."feature_branch" IS 'Feature branch name for this task';
COMMENT ON COLUMN "tasks"."pull_request_url" IS 'Pull request URL for this task';
