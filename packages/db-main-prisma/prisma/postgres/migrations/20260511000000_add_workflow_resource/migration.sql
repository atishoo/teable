CREATE TABLE IF NOT EXISTS "workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "trigger" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "deleted_time" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_modified_time" TIMESTAMP(3),
    "last_modified_by" TEXT,
    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_base_id_deleted_time_idx" ON "workflow"("base_id", "deleted_time");

COMMENT ON TABLE "workflow" IS 'Workflow resources used by automation and button fields.';
COMMENT ON COLUMN "workflow"."id" IS 'Workflow resource identifier.';
COMMENT ON COLUMN "workflow"."name" IS 'Workflow display name.';
COMMENT ON COLUMN "workflow"."base_id" IS 'Base identifier owning this workflow.';
COMMENT ON COLUMN "workflow"."trigger" IS 'Workflow trigger configuration.';
COMMENT ON COLUMN "workflow"."is_active" IS 'Whether this workflow is active.';
COMMENT ON COLUMN "workflow"."deleted_time" IS 'Soft deletion timestamp.';
COMMENT ON COLUMN "workflow"."created_by" IS 'User identifier that created this workflow.';
COMMENT ON COLUMN "workflow"."created_time" IS 'Workflow creation timestamp.';
COMMENT ON COLUMN "workflow"."last_modified_time" IS 'Last modification timestamp.';
COMMENT ON COLUMN "workflow"."last_modified_by" IS 'User identifier that last modified this workflow.';
