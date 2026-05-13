ALTER TABLE "workflow"
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "nodes" JSONB,
ADD COLUMN IF NOT EXISTS "edges" JSONB,
ADD COLUMN IF NOT EXISTS "active_snapshot" JSONB,
ADD COLUMN IF NOT EXISTS "active_time" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "active_by" TEXT;

UPDATE "workflow"
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
  "edges" = COALESCE("edges", '[]'::jsonb);

CREATE INDEX IF NOT EXISTS "workflow_is_active_deleted_time_idx" ON "workflow"("is_active", "deleted_time");

CREATE TABLE IF NOT EXISTS "workflow_run" (
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
);

CREATE INDEX IF NOT EXISTS "workflow_run_workflow_id_started_time_idx" ON "workflow_run"("workflow_id", "started_time");
CREATE INDEX IF NOT EXISTS "workflow_run_base_id_started_time_idx" ON "workflow_run"("base_id", "started_time");

COMMENT ON COLUMN "workflow"."description" IS 'Workflow description.';
COMMENT ON COLUMN "workflow"."nodes" IS 'Draft workflow graph nodes for manual automation.';
COMMENT ON COLUMN "workflow"."edges" IS 'Draft workflow graph edges for manual automation.';
COMMENT ON COLUMN "workflow"."active_snapshot" IS 'Published workflow graph snapshot used at runtime.';
COMMENT ON COLUMN "workflow"."active_time" IS 'Timestamp when the active snapshot was published.';
COMMENT ON COLUMN "workflow"."active_by" IS 'User identifier that last activated this workflow.';

COMMENT ON TABLE "workflow_run" IS 'Workflow execution run history.';
COMMENT ON COLUMN "workflow_run"."id" IS 'Workflow run identifier.';
COMMENT ON COLUMN "workflow_run"."workflow_id" IS 'Workflow identifier.';
COMMENT ON COLUMN "workflow_run"."base_id" IS 'Base identifier owning the workflow run.';
COMMENT ON COLUMN "workflow_run"."status" IS 'Workflow run status: running, success, failed, or skipped.';
COMMENT ON COLUMN "workflow_run"."trigger_type" IS 'Trigger type that started this run.';
COMMENT ON COLUMN "workflow_run"."input" IS 'Workflow run input payload.';
COMMENT ON COLUMN "workflow_run"."output" IS 'Workflow run output payload.';
COMMENT ON COLUMN "workflow_run"."steps" IS 'Per-node execution result details.';
COMMENT ON COLUMN "workflow_run"."error" IS 'Workflow run error message if failed.';
COMMENT ON COLUMN "workflow_run"."started_time" IS 'Workflow run start timestamp.';
COMMENT ON COLUMN "workflow_run"."finished_time" IS 'Workflow run finish timestamp.';
COMMENT ON COLUMN "workflow_run"."created_by" IS 'User identifier that triggered this run.';
