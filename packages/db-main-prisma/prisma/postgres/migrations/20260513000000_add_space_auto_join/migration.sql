-- AlterTable
ALTER TABLE "space" ADD COLUMN "enable_auto_join" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON TABLE "space" IS 'Workspace container for bases and collaborators.';
COMMENT ON COLUMN "space"."enable_auto_join" IS 'Whether newly registered users automatically join this space with read permission.';
