import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { MultiStageOrchestrator } from './multiStageOrchestrator.js';
import type { StageContext } from '../types/multiStage.js';

export interface SandboxTestResult {
  response: string;
  intent: string;
  stagesExecuted: string[];
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
}

const SANDBOX_PHONE_PREFIX = 'sandbox:';

/**
 * Look up (or create) the dedicated sandbox customer + conversation for a
 * vendor. We guarantee uniqueness across vendors by prefixing the phone
 * with the vendorId — `Customer.phone` is globally unique in the schema, so
 * a single dedicated row per vendor is the simplest safe approach.
 */
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

/**
 * Run the full multi-stage pipeline as if a customer sent `text` to this
 * vendor — but with all outbound side effects (WhatsApp publish, assistant
 * Message persistence, message-summary write on the inbound) suppressed via
 * `StageContext.sandbox = true`. Returns the refined reply and per-run
 * metrics so the vendor can preview what their AI will say.
 */
export async function runSandboxTest(
  vendorId: string,
  text: string
): Promise<SandboxTestResult> {
  const { customerId, conversationId } = await ensureSandboxConversation(vendorId);

  // Persist the inbound message — the orchestrator reads it back by ID in
  // several stages, so we need a real row. This is the only DB side effect
  // of a sandbox run.
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
