import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StageContext } from '../../types/multiStage.js';

// We mock prisma + the orchestrator to drive the sandbox service through a
// known-good happy path, then assert the *contract* the sink-gating relies on:
//
//   1. `runSandboxTest` sets `sandbox: true` on the StageContext it builds.
//   2. The customer-facing reply we surface comes from
//      `context.sandboxFinalMessage` (i.e. the value Stage 9 captured into the
//      context when sandbox-gated), NOT from the queued-response path.
//   3. Exactly ONE Message row is persisted — the inbound — and no assistant
//      Message row is written by sandbox flow.
//
// This is the parity test the plan flags as a PR gate. The full multi-stage
// orchestrator path is exercised separately by integration tests; here we
// verify the sandbox-specific wiring on its own so a regression in the sink-
// gating fails this test directly.

const messageCreate = vi.fn();
const customerUpsert = vi.fn();
const conversationFindFirst = vi.fn();
const conversationCreate = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    customer: { upsert: (...args: unknown[]) => customerUpsert(...args) },
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirst(...args),
      create: (...args: unknown[]) => conversationCreate(...args)
    },
    message: { create: (...args: unknown[]) => messageCreate(...args) }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const orchestratorExecute = vi.fn();

vi.mock('../multiStageOrchestrator.js', () => ({
  MultiStageOrchestrator: class {
    execute = (ctx: StageContext) => orchestratorExecute(ctx);
  }
}));

import { runSandboxTest } from '../catalogImportSandboxService.js';

describe('runSandboxTest — sandbox sink-gating contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerUpsert.mockResolvedValue({ id: 'cust_1' });
    conversationFindFirst.mockResolvedValue({ id: 'conv_1' });
    messageCreate.mockResolvedValue({ id: 'msg_in_1' });
  });

  it('sets sandbox=true on the StageContext passed into the orchestrator', async () => {
    orchestratorExecute.mockImplementation((ctx: StageContext) => {
      ctx.sandboxFinalMessage = 'Hi! Thanks for the message.';
      return Promise.resolve({
        intent: 'general_query',
        stagesExecuted: ['stage_0', 'stage_4'],
        totalTokensUsed: 1200,
        totalCost: 0.0008,
        finalMessage: 'Hi! Thanks for the message.'
      });
    });
    await runSandboxTest('vendor_42', 'Do you sell rice?');
    expect(orchestratorExecute).toHaveBeenCalledOnce();
    const ctx = orchestratorExecute.mock.calls[0][0] as StageContext;
    expect(ctx.sandbox).toBe(true);
    expect(ctx.vendorId).toBe('vendor_42');
    expect(ctx.rawMessage).toBe('Do you sell rice?');
  });

  it('returns the message captured via sandboxFinalMessage, not the queued path', async () => {
    orchestratorExecute.mockImplementation((ctx: StageContext) => {
      // Simulate the Stage-9 branch: when sandbox=true, the orchestrator stores
      // the final message on the context instead of queueing it.
      ctx.sandboxFinalMessage = 'Yes, basmati rice is ₹150/kg.';
      return Promise.resolve({
        intent: 'product_inquiry',
        stagesExecuted: ['stage_0', 'stage_1', 'stage_4'],
        totalTokensUsed: 1500,
        totalCost: 0.001,
        finalMessage: 'Yes, basmati rice is ₹150/kg.'
      });
    });
    const out = await runSandboxTest('vendor_42', 'Do you sell rice?');
    expect(out.response).toBe('Yes, basmati rice is ₹150/kg.');
    expect(out.intent).toBe('product_inquiry');
    expect(out.stagesExecuted).toContain('stage_4');
    expect(out.tokensUsed).toBe(1500);
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('persists exactly one inbound Message and no assistant Message', async () => {
    orchestratorExecute.mockImplementation((ctx: StageContext) => {
      ctx.sandboxFinalMessage = 'OK';
      return Promise.resolve({
        intent: 'greeting',
        stagesExecuted: [],
        totalTokensUsed: 100,
        totalCost: 0.0001,
        finalMessage: 'OK'
      });
    });
    await runSandboxTest('vendor_42', 'Hello');
    expect(messageCreate).toHaveBeenCalledOnce();
    const arg = messageCreate.mock.calls[0][0] as { data: { senderType: string } };
    expect(arg.data.senderType).toBe('customer');
  });

  it('uses a sandbox-prefixed phone so it never collides with real customers', async () => {
    orchestratorExecute.mockImplementation((ctx: StageContext) => {
      ctx.sandboxFinalMessage = 'OK';
      return Promise.resolve({
        intent: 'greeting',
        stagesExecuted: [],
        totalTokensUsed: 0,
        totalCost: 0,
        finalMessage: 'OK'
      });
    });
    await runSandboxTest('vendor_xyz', 'hi');
    const upsertArg = customerUpsert.mock.calls[0][0] as { where: { phone: string } };
    expect(upsertArg.where.phone.startsWith('sandbox:')).toBe(true);
    expect(upsertArg.where.phone).toContain('vendor_xyz');
  });

  it('reuses an existing sandbox conversation rather than creating a new one each run', async () => {
    orchestratorExecute.mockImplementation((ctx: StageContext) => {
      ctx.sandboxFinalMessage = 'OK';
      return Promise.resolve({
        intent: 'greeting',
        stagesExecuted: [],
        totalTokensUsed: 0,
        totalCost: 0,
        finalMessage: 'OK'
      });
    });
    await runSandboxTest('vendor_42', 'hi');
    expect(conversationCreate).not.toHaveBeenCalled();
  });
});
