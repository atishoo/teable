DROP TABLE IF EXISTS "ai_chat_message";
DROP TABLE IF EXISTS "ai_chat";

CREATE TABLE "ai_chat" (
  "id" TEXT NOT NULL,
  "base_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'general',
  "status" TEXT NOT NULL DEFAULT 'idle',
  "agent_session_id" TEXT,
  "workspace_key" TEXT,
  "selected_model" TEXT,
  "selected_effort" TEXT,
  "deleted_time" TIMESTAMP(3),
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "last_modified_time" TIMESTAMP(3),
  "last_modified_by" TEXT,

  CONSTRAINT "ai_chat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_chat_message" (
  "id" TEXT NOT NULL,
  "chat_id" TEXT NOT NULL,
  "base_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "creator_role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "type" TEXT,
  "context_labels" TEXT,
  "attachment_names" TEXT,
  "parts" TEXT,
  "elapsed_ms" INTEGER,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "last_modified_time" TIMESTAMP(3),

  CONSTRAINT "ai_chat_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_chat_base_id_created_by_deleted_time_last_modified_time_idx" ON "ai_chat"("base_id", "created_by", "deleted_time", "last_modified_time");
CREATE INDEX "ai_chat_message_base_id_chat_id_created_time_idx" ON "ai_chat_message"("base_id", "chat_id", "created_time");
CREATE INDEX "ai_chat_message_created_by_base_id_created_time_idx" ON "ai_chat_message"("created_by", "base_id", "created_time");

ALTER TABLE "ai_chat_message" ADD CONSTRAINT "ai_chat_message_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE "ai_chat" IS 'AI agent chat sessions scoped by base and owner.';
COMMENT ON COLUMN "ai_chat"."id" IS 'AI chat session id.';
COMMENT ON COLUMN "ai_chat"."base_id" IS 'Base id that owns this AI chat session.';
COMMENT ON COLUMN "ai_chat"."title" IS 'AI chat session title displayed in history.';
COMMENT ON COLUMN "ai_chat"."type" IS 'AI chat type, general by default.';
COMMENT ON COLUMN "ai_chat"."status" IS 'Current AI agent chat status.';
COMMENT ON COLUMN "ai_chat"."agent_session_id" IS 'Sandbox agent provider session id for resume.';
COMMENT ON COLUMN "ai_chat"."workspace_key" IS 'Sandbox workspace key isolated for this chat.';
COMMENT ON COLUMN "ai_chat"."selected_model" IS 'Model key selected for this AI chat.';
COMMENT ON COLUMN "ai_chat"."selected_effort" IS 'Reasoning effort selected for this AI chat.';
COMMENT ON COLUMN "ai_chat"."deleted_time" IS 'Soft deletion time for hidden AI chat sessions.';
COMMENT ON COLUMN "ai_chat"."created_time" IS 'AI chat session creation time.';
COMMENT ON COLUMN "ai_chat"."created_by" IS 'User id that created this AI chat session.';
COMMENT ON COLUMN "ai_chat"."last_modified_time" IS 'Last time this AI chat session was updated.';
COMMENT ON COLUMN "ai_chat"."last_modified_by" IS 'Last user id that updated this AI chat session.';

COMMENT ON TABLE "ai_chat_message" IS 'Structured messages inside AI agent chat sessions.';
COMMENT ON COLUMN "ai_chat_message"."id" IS 'AI chat message id.';
COMMENT ON COLUMN "ai_chat_message"."chat_id" IS 'AI chat session id this message belongs to.';
COMMENT ON COLUMN "ai_chat_message"."base_id" IS 'Base id duplicated for efficient history filtering.';
COMMENT ON COLUMN "ai_chat_message"."creator_id" IS 'Logical message creator id.';
COMMENT ON COLUMN "ai_chat_message"."creator_role" IS 'Message creator role: system, user, or assistant.';
COMMENT ON COLUMN "ai_chat_message"."content" IS 'Plain text projection of message content.';
COMMENT ON COLUMN "ai_chat_message"."status" IS 'Message generation status.';
COMMENT ON COLUMN "ai_chat_message"."type" IS 'Optional message rendering type.';
COMMENT ON COLUMN "ai_chat_message"."context_labels" IS 'JSON-encoded context labels attached to the user message.';
COMMENT ON COLUMN "ai_chat_message"."attachment_names" IS 'JSON-encoded attachment names attached to the user message.';
COMMENT ON COLUMN "ai_chat_message"."parts" IS 'JSON-encoded structured message parts for agent UI rendering.';
COMMENT ON COLUMN "ai_chat_message"."elapsed_ms" IS 'Assistant response elapsed time in milliseconds.';
COMMENT ON COLUMN "ai_chat_message"."created_time" IS 'Message creation time.';
COMMENT ON COLUMN "ai_chat_message"."created_by" IS 'User id that owns this message.';
COMMENT ON COLUMN "ai_chat_message"."last_modified_time" IS 'Last time this message was updated.';
