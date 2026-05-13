import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

const workflowSchemaSql = [
  `CREATE TABLE IF NOT EXISTS "workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_id" TEXT NOT NULL,
    "trigger" JSONB,
    "nodes" JSONB,
    "edges" JSONB,
    "active_snapshot" JSONB,
    "active_time" TIMESTAMP(3),
    "active_by" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "deleted_time" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_modified_time" TIMESTAMP(3),
    "last_modified_by" TEXT,
    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "workflow"
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "nodes" JSONB,
    ADD COLUMN IF NOT EXISTS "edges" JSONB,
    ADD COLUMN IF NOT EXISTS "active_snapshot" JSONB,
    ADD COLUMN IF NOT EXISTS "active_time" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "active_by" TEXT`,
  `UPDATE "workflow"
  SET
    "nodes" = CASE
      WHEN "nodes" IS NULL AND "trigger" IS NOT NULL THEN jsonb_build_array(
        jsonb_build_object(
          'id',
          'wtr' || substr("id", 4),
          'type',
          COALESCE("trigger"->>'type', 'buttonClick'),
          'category',
          'trigger',
          'name',
          COALESCE("trigger"->>'type', 'buttonClick'),
          'config',
          COALESCE("trigger"->'config', '{}'::jsonb)
        )
      )
      WHEN "nodes" IS NULL THEN '[]'::jsonb
      ELSE "nodes"
    END,
    "edges" = COALESCE("edges", '[]'::jsonb)`,
  `CREATE INDEX IF NOT EXISTS "workflow_base_id_deleted_time_idx" ON "workflow"("base_id", "deleted_time")`,
  `CREATE INDEX IF NOT EXISTS "workflow_is_active_deleted_time_idx" ON "workflow"("is_active", "deleted_time")`,
  `CREATE TABLE IF NOT EXISTS "workflow_run" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger_type" TEXT,
    "input" JSONB,
    "output" JSONB,
    "steps" JSONB,
    "error" TEXT,
    "started_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_time" TIMESTAMP(3),
    "created_by" TEXT,
    CONSTRAINT "workflow_run_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "workflow_run_workflow_id_started_time_idx" ON "workflow_run"("workflow_id", "started_time")`,
  `CREATE INDEX IF NOT EXISTS "workflow_run_base_id_started_time_idx" ON "workflow_run"("base_id", "started_time")`,
  `COMMENT ON TABLE "workflow" IS 'Workflow resources used by automation and button fields.'`,
  `COMMENT ON COLUMN "workflow"."id" IS 'Workflow resource identifier.'`,
  `COMMENT ON COLUMN "workflow"."name" IS 'Workflow display name.'`,
  `COMMENT ON COLUMN "workflow"."description" IS 'Workflow description.'`,
  `COMMENT ON COLUMN "workflow"."base_id" IS 'Base identifier owning this workflow.'`,
  `COMMENT ON COLUMN "workflow"."trigger" IS 'Workflow trigger configuration.'`,
  `COMMENT ON COLUMN "workflow"."nodes" IS 'Draft workflow graph nodes for manual automation.'`,
  `COMMENT ON COLUMN "workflow"."edges" IS 'Draft workflow graph edges for manual automation.'`,
  `COMMENT ON COLUMN "workflow"."active_snapshot" IS 'Published workflow graph snapshot used at runtime.'`,
  `COMMENT ON COLUMN "workflow"."active_time" IS 'Timestamp when the active snapshot was published.'`,
  `COMMENT ON COLUMN "workflow"."active_by" IS 'User identifier that last activated this workflow.'`,
  `COMMENT ON COLUMN "workflow"."is_active" IS 'Whether this workflow is active.'`,
  `COMMENT ON COLUMN "workflow"."deleted_time" IS 'Soft deletion timestamp.'`,
  `COMMENT ON COLUMN "workflow"."created_by" IS 'User identifier that created this workflow.'`,
  `COMMENT ON COLUMN "workflow"."created_time" IS 'Workflow creation timestamp.'`,
  `COMMENT ON COLUMN "workflow"."last_modified_time" IS 'Last modification timestamp.'`,
  `COMMENT ON COLUMN "workflow"."last_modified_by" IS 'User identifier that last modified this workflow.'`,
  `COMMENT ON TABLE "workflow_run" IS 'Workflow execution run history.'`,
  `COMMENT ON COLUMN "workflow_run"."id" IS 'Workflow run identifier.'`,
  `COMMENT ON COLUMN "workflow_run"."workflow_id" IS 'Workflow identifier.'`,
  `COMMENT ON COLUMN "workflow_run"."base_id" IS 'Base identifier owning the workflow run.'`,
  `COMMENT ON COLUMN "workflow_run"."status" IS 'Workflow run status: running, success, failed, or skipped.'`,
  `COMMENT ON COLUMN "workflow_run"."trigger_type" IS 'Trigger type that started this run.'`,
  `COMMENT ON COLUMN "workflow_run"."input" IS 'Workflow run input payload.'`,
  `COMMENT ON COLUMN "workflow_run"."output" IS 'Workflow run output payload.'`,
  `COMMENT ON COLUMN "workflow_run"."steps" IS 'Per-node execution result details.'`,
  `COMMENT ON COLUMN "workflow_run"."error" IS 'Workflow run error message if failed.'`,
  `COMMENT ON COLUMN "workflow_run"."started_time" IS 'Workflow run start timestamp.'`,
  `COMMENT ON COLUMN "workflow_run"."finished_time" IS 'Workflow run finish timestamp.'`,
  `COMMENT ON COLUMN "workflow_run"."created_by" IS 'User identifier that triggered this run.'`,
];

@Injectable()
export class InitBootstrapService {
  constructor(private readonly prismaService: PrismaService) {}

  async init() {
    for (const sql of workflowSchemaSql) {
      await this.prismaService.$executeRawUnsafe(sql);
    }
  }
}
