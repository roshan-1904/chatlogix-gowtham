-- Add aiPaused column to Conversation table
ALTER TABLE "Conversation" ADD COLUMN "aiPaused" BOOLEAN NOT NULL DEFAULT false;

