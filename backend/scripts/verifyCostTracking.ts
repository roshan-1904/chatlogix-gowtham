/**
 * Verification script for USD cost tracking.
 * Compares sum(StageExecutionLog.cost) vs Message.aiCostUsd for recent assistant messages.
 *
 * Usage: npx tsx scripts/verifyCostTracking.ts [conversationId]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TOLERANCE = 0.000001; // USD rounding tolerance

async function verify(conversationId?: string) {
  const where: Record<string, unknown> = { senderType: 'assistant' };
  if (conversationId) {
    where.conversationId = conversationId;
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: 50,
    select: {
      id: true,
      conversationId: true,
      aiTokensUsed: true,
      aiCostUsd: true,
      aiPromptTokens: true,
      aiCompletionTokens: true,
      aiPrimaryModel: true,
      aiModelBreakdown: true,
      aiCostEstimated: true,
      timestamp: true
    }
  });

  if (messages.length === 0) {
    console.log('No assistant messages found.');
    return;
  }

  let mismatches = 0;

  for (const msg of messages) {
    const stages = await prisma.stageExecutionLog.findMany({
      where: { messageId: msg.id },
      select: {
        stageName: true,
        cost: true,
        tokensUsed: true,
        model: true,
        promptTokens: true,
        completionTokens: true
      }
    });

    // Note: messageId in StageExecutionLog is the incoming message ID, not the assistant message ID.
    // If no stages found, try matching by conversationId and approximate time.
    if (stages.length === 0) continue;

    const stageCostSum = stages.reduce((sum, s) => sum + (s.cost || 0), 0);
    const stageTokenSum = stages.reduce((sum, s) => sum + (s.tokensUsed || 0), 0);
    const stagePromptSum = stages.reduce((sum, s) => sum + (s.promptTokens || 0), 0);
    const stageCompletionSum = stages.reduce((sum, s) => sum + (s.completionTokens || 0), 0);

    const costDiff = Math.abs((msg.aiCostUsd || 0) - stageCostSum);
    const tokenDiff = Math.abs(msg.aiTokensUsed - stageTokenSum);

    const ok = costDiff <= TOLERANCE;

    console.log(`\nMessage ${msg.id} (${msg.timestamp.toISOString()})`);
    console.log(`  Model: ${msg.aiPrimaryModel || 'N/A'} | Estimated: ${msg.aiCostEstimated}`);
    console.log(`  Message.aiCostUsd:   ${msg.aiCostUsd}`);
    console.log(`  Sum(stage.cost):     ${stageCostSum.toFixed(8)}`);
    console.log(`  Cost diff:           ${costDiff.toFixed(8)} ${ok ? '✓' : '✗ MISMATCH'}`);
    console.log(`  Tokens — msg: ${msg.aiTokensUsed}, stages: ${stageTokenSum}, diff: ${tokenDiff}`);
    console.log(`  Prompt tokens — msg: ${msg.aiPromptTokens}, stages: ${stagePromptSum}`);
    console.log(`  Completion tokens — msg: ${msg.aiCompletionTokens}, stages: ${stageCompletionSum}`);

    if (msg.aiModelBreakdown) {
      console.log(`  Model breakdown:`, JSON.stringify(msg.aiModelBreakdown, null, 2));
    }

    if (!ok) mismatches++;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Checked: ${messages.length} messages`);
  console.log(`Mismatches: ${mismatches}`);

  if (mismatches > 0) {
    process.exit(1);
  }
}

const conversationId = process.argv[2];
verify(conversationId)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
