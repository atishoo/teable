-- CreateTable
CREATE TABLE "ai_chat" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "deleted_time" DATETIME,
  "created_time" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "last_modified_time" DATETIME,
  "last_modified_by" TEXT
);

-- CreateTable
CREATE TABLE "ai_chat_message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chat_id" TEXT NOT NULL,
  "base_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "creator_role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "type" TEXT,
  "context_labels" TEXT,
  "attachment_names" TEXT,
  "elapsed_ms" INTEGER,
  "created_time" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "last_modified_time" DATETIME,
  CONSTRAINT "ai_chat_message_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ai_chat_base_id_created_by_deleted_time_last_modified_time_idx" ON "ai_chat"("base_id", "created_by", "deleted_time", "last_modified_time");

-- CreateIndex
CREATE INDEX "ai_chat_message_base_id_chat_id_created_time_idx" ON "ai_chat_message"("base_id", "chat_id", "created_time");

-- CreateIndex
CREATE INDEX "ai_chat_message_created_by_base_id_created_time_idx" ON "ai_chat_message"("created_by", "base_id", "created_time");
