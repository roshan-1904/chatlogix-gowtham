-- Conversation-scoped lock for the incoming response generator.
-- Replaces the Redis SET NX lock so the pipeline does not need ElastiCache.
CREATE TABLE "ConversationLock" (
    "conversationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationLock_pkey" PRIMARY KEY ("conversationId")
);
