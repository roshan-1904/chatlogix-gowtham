import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { MultiStageOrchestrator } from './multiStageOrchestrator.js';
import type { StageContext } from '../types/multiStage.js';

/**
 * @deprecated For vendor onboarding demo chat, use `onboardingSandboxService`
 * with production `conversation/pipeline.ts` (`sandbox: true`). This orchestrator
 * path remains for legacy catalog-import go-live console only.
 */

export interface SandboxTestResult {
  response: string;
  intent: string;
  stagesExecuted: string[];
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
}

const SANDBOX_PHONE_PREFIX = 'sandbox:';

async function ensureSandboxConversation(vendorId: string): Promise<{
  customerId: string;
  conversationId: string;
}> {
  const phone = `${SANDBOX_PHONE_PREFIX}${vendorId}`;
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: {},
    create: { phone }
  });

  const existing = await prisma.conversation.findFirst({
    where: { vendorId, customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  });
  if (existing) return { customerId: customer.id, conversationId: existing.id };

  const created = await prisma.conversation.create({
    data: { vendorId, customerId: customer.id, status: 'sandbox' }
  });
  return { customerId: customer.id, conversationId: created.id };
}

export async function runSandboxTest(
  vendorId: string,
  text: string
): Promise<SandboxTestResult> {
  const { customerId, conversationId } = await ensureSandboxConversation(vendorId);

  const inbound = await prisma.message.create({
    data: {
      conversationId,
      senderType: 'customer',
      content: text,
      type: 'text'
    },
    select: { id: true }
  });

  const context: StageContext = {
    conversationId,
    vendorId,
    customerId,
    messageId: inbound.id,
    rawMessage: text,
    sandbox: true
  };

  const orchestrator = new MultiStageOrchestrator();
  const start = Date.now();
  try {
    const result = await orchestrator.execute(context);
    const response =
      context.sandboxFinalMessage ??
      result.finalMessage ??
      '';
    return {
      response,
      intent: result.intent,
      stagesExecuted: result.stagesExecuted,
      tokensUsed: result.totalTokensUsed,
      costUsd: result.totalCost,
      durationMs: Date.now() - start
    };
  } catch (err) {
    logger.error({ err, vendorId, conversationId }, 'sandbox_test_failed');
    throw err;
  }
}
