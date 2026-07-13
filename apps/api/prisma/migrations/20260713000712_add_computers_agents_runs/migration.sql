-- CreateEnum
CREATE TYPE "ComputerStatus" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('idle', 'running', 'offline');

-- CreateEnum
CREATE TYPE "Runtime" AS ENUM ('claude_code', 'openai_api', 'codex', 'mock');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'dispatched', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'denied');

-- AlterTable
ALTER TABLE "actors" ADD COLUMN     "agent_id" UUID;

-- CreateTable
CREATE TABLE "computers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "daemon_version" TEXT,
    "status" "ComputerStatus" NOT NULL DEFAULT 'offline',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "computers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "computer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_id" UUID,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "avatar_url" TEXT,
    "tagline" TEXT,
    "system_prompt" TEXT,
    "runtime" "Runtime" NOT NULL DEFAULT 'mock',
    "model" TEXT,
    "computer_id" UUID,
    "approvalPolicy" JSONB NOT NULL DEFAULT '{}',
    "status" "AgentStatus" NOT NULL DEFAULT 'offline',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "computer_id" UUID,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID,
    "trigger_message_id" UUID,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "model" TEXT,
    "tokens_in" BIGINT NOT NULL DEFAULT 0,
    "tokens_out" BIGINT NOT NULL DEFAULT 0,
    "cost_estimate_cents" INTEGER,
    "error" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_events" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "message_id" UUID,
    "requested_action" JSONB NOT NULL,
    "decided_by" UUID,
    "decision" "ApprovalDecision",
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "computers_workspace_id_idx" ON "computers"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_hash_key" ON "device_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "device_tokens_computer_id_idx" ON "device_tokens"("computer_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_actor_id_key" ON "agents"("actor_id");

-- CreateIndex
CREATE INDEX "agents_workspace_id_idx" ON "agents"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_workspace_id_handle_key" ON "agents"("workspace_id", "handle");

-- CreateIndex
CREATE INDEX "agent_runs_agent_id_idx" ON "agent_runs"("agent_id");

-- CreateIndex
CREATE INDEX "agent_runs_workspace_id_status_idx" ON "agent_runs"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "run_events_run_id_idx" ON "run_events"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_events_run_id_seq_key" ON "run_events"("run_id", "seq");

-- CreateIndex
CREATE INDEX "approvals_run_id_idx" ON "approvals"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "actors_agent_id_key" ON "actors"("agent_id");

-- AddForeignKey
ALTER TABLE "computers" ADD CONSTRAINT "computers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computers" ADD CONSTRAINT "computers_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_computer_id_fkey" FOREIGN KEY ("computer_id") REFERENCES "computers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_computer_id_fkey" FOREIGN KEY ("computer_id") REFERENCES "computers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_computer_id_fkey" FOREIGN KEY ("computer_id") REFERENCES "computers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

