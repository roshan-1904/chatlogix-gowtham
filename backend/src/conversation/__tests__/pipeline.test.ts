import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every value referenced inside a vi.mock() factory must come from
// vi.hoisted() — a plain `const` declared before the mock call is still in
// its temporal dead zone when the (also-hoisted) factory runs at import
// time (see Step 6/8's notes in the implementation plan for why).
const {
  persistTurnMock,
  debitAfterEnqueueMock,
  publishToQueueMock,
  messageProcessingUpdateMany,
  messageProcessingFindUnique,
  conversationFindUnique,
  logStageMock,
  logLatencyMock,
  logCountMock,
  resolveIdentityMock,
  acquireLockMock,
  releaseLockMock,
  MockLockContentionError,
  MockLockUnavailableError,
  upsertInboundMessageMock,
  canProcessMessageMock,
  stashForBurstMergeMock,
  collectCoalescedInboundMock,
  markCoalescedSiblingsMock,
  prefetchHotSetMock,
  runLlm1Mock,
  applyMock,
  runLlm2Mock,
  selectFinalReplyMock,
  renderRejectedOpsReplyMock,
  triggerHandoffMock,
  notifyVendorNewOrderMock,
  notifyVendorOfPostSalesEventMock,
  sendTypingIndicatorMock,
  ensureMessageContentEnMock,
  normalizeSetFieldOpsMock,
  persistKnowledgeGapIfNeededMock,
  enrichCustomerInsightsIfNeededMock,
  resolveProductMediaAttachmentsMock,
  persistPendingOutboundMediaMock,
  collectSendProductMediaOpsMock
} = vi.hoisted(() => {
  class MockLockContentionError extends Error {}
  class MockLockUnavailableError extends Error {}
  return {
    persistTurnMock: vi.fn(),
    debitAfterEnqueueMock: vi.fn(),
    publishToQueueMock: vi.fn(),
    messageProcessingUpdateMany: vi.fn(),
    messageProcessingFindUnique: vi.fn(),
    conversationFindUnique: vi.fn(),
    logStageMock: vi.fn(),
    logLatencyMock: vi.fn(),
    logCountMock: vi.fn(),
    resolveIdentityMock: vi.fn(),
    acquireLockMock: vi.fn(),
    releaseLockMock: vi.fn(),
    MockLockContentionError,
    MockLockUnavailableError,
    upsertInboundMessageMock: vi.fn(),
    canProcessMessageMock: vi.fn(),
    stashForBurstMergeMock: vi.fn(),
    collectCoalescedInboundMock: vi.fn(),
    markCoalescedSiblingsMock: vi.fn(),
    prefetchHotSetMock: vi.fn(),
    runLlm1Mock: vi.fn(),
    applyMock: vi.fn(),
    runLlm2Mock: vi.fn(),
    selectFinalReplyMock: vi.fn(),
    renderRejectedOpsReplyMock: vi.fn(),
    triggerHandoffMock: vi.fn(),
    notifyVendorNewOrderMock: vi.fn(),
    notifyVendorOfPostSalesEventMock: vi.fn(),
    sendTypingIndicatorMock: vi.fn(),
    ensureMessageContentEnMock: vi.fn(),
    normalizeSetFieldOpsMock: vi.fn(),
    persistKnowledgeGapIfNeededMock: vi.fn(),
    enrichCustomerInsightsIfNeededMock: vi.fn(),
    resolveProductMediaAttachmentsMock: vi.fn(),
    persistPendingOutboundMediaMock: vi.fn(),
    collectSendProductMediaOpsMock: vi.fn()
  };
});

vi.mock('../persist.js', () => ({
  persistTurn: (...args: unknown[]) => persistTurnMock(...args),
  markCoalescedSiblings: (...args: unknown[]) => markCoalescedSiblingsMock(...args),
  persistPendingOutboundMedia: (...args: unknown[]) => persistPendingOutboundMediaMock(...args)
}));
vi.mock('../productMediaAttachments.js', () => ({
  collectSendProductMediaOps: (...args: unknown[]) => collectSendProductMediaOpsMock(...args),
  resolveProductMediaAttachments: (...args: unknown[]) => resolveProductMediaAttachmentsMock(...args)
}));
vi.mock('../billing.js', () => ({ debitAfterEnqueue: (...args: unknown[]) => debitAfterEnqueueMock(...args) }));
vi.mock('../../queue/sqsClient.js', () => ({ publishToQueue: (...args: unknown[]) => publishToQueueMock(...args) }));
vi.mock('../../config/env.js', () => ({ env: { RESPONSE_QUEUE_URL: 'https://sqs.example/response-queue' } }));
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    messageProcessing: {
      updateMany: (...args: unknown[]) => messageProcessingUpdateMany(...args),
      findUnique: (...args: unknown[]) => messageProcessingFindUnique(...args)
    },
    conversation: { findUnique: (...args: unknown[]) => conversationFindUnique(...args) }
  }
}));
vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../metrics.js', () => ({
  logStage: (...args: unknown[]) => logStageMock(...args),
  logLatency: (...args: unknown[]) => logLatencyMock(...args),
  logCount: (...args: unknown[]) => logCountMock(...args)
}));
vi.mock('../identity.js', () => ({ resolveIdentity: (...args: unknown[]) => resolveIdentityMock(...args) }));
vi.mock('../lock.js', () => ({
  acquireLock: (...args: unknown[]) => acquireLockMock(...args),
  releaseLock: (...args: unknown[]) => releaseLockMock(...args),
  LockContentionError: MockLockContentionError,
  LockUnavailableError: MockLockUnavailableError
}));
vi.mock('../idempotency.js', () => ({ upsertInboundMessage: (...args: unknown[]) => upsertInboundMessageMock(...args) }));
vi.mock('../../services/billingService.js', () => ({ canProcessMessage: (...args: unknown[]) => canProcessMessageMock(...args) }));
vi.mock('../burstMerge.js', () => ({
  stashForBurstMerge: (...args: unknown[]) => stashForBurstMergeMock(...args)
}));
vi.mock('../coalesceInbound.js', () => ({
  collectCoalescedInbound: (...args: unknown[]) => collectCoalescedInboundMock(...args)
}));
vi.mock('../prefetch.js', () => ({ prefetchHotSet: (...args: unknown[]) => prefetchHotSetMock(...args) }));
vi.mock('../llm/llm1.js', () => ({ runLlm1: (...args: unknown[]) => runLlm1Mock(...args) }));
vi.mock('../cart/engine.js', () => ({ apply: (...args: unknown[]) => applyMock(...args) }));
vi.mock('../orderPaymentPipeline.js', () => ({
  handleOrderPaymentLinksAfterCartApply: vi.fn().mockResolvedValue({}),
  maybeDeclinePaymentLinkOffer: vi.fn().mockResolvedValue(undefined),
  buildPaymentLinkQuestion: vi.fn().mockReturnValue('Shall I send the payment link?')
}));
vi.mock('../llm/llm2.js', () => ({
  runLlm2: (...args: unknown[]) => runLlm2Mock(...args),
  selectFinalReply: (...args: unknown[]) => selectFinalReplyMock(...args),
  renderRejectedOpsReply: (...args: unknown[]) => renderRejectedOpsReplyMock(...args)
}));
vi.mock('../handoff.js', () => ({ triggerHandoff: (...args: unknown[]) => triggerHandoffMock(...args) }));
vi.mock('../customerQuery.js', () => ({
  persistKnowledgeGapIfNeeded: (...args: unknown[]) => persistKnowledgeGapIfNeededMock(...args)
}));
vi.mock('../customerInsightsEnrichment.js', () => ({
  enrichCustomerInsightsIfNeeded: (...args: unknown[]) => enrichCustomerInsightsIfNeededMock(...args)
}));
vi.mock('../postSalesAlert.js', () => ({ notifyVendorOfPostSalesEvent: (...args: unknown[]) => notifyVendorOfPostSalesEventMock(...args) }));
vi.mock('../../services/whatsappTemplateService.js', () => ({
  WhatsAppTemplateService: vi.fn().mockImplementation(() => ({
    notifyVendorNewOrder: (...args: unknown[]) => notifyVendorNewOrderMock(...args)
  }))
}));
vi.mock('../../services/whatsappClient.js', () => ({
  sendTypingIndicator: (...args: unknown[]) => sendTypingIndicatorMock(...args)
}));
vi.mock('../../utils/vendorEnglish.js', () => ({
  ensureMessageContentEn: (...args: unknown[]) => ensureMessageContentEnMock(...args),
  normalizeSetFieldOps: (...args: unknown[]) => normalizeSetFieldOpsMock(...args)
}));

import { finalizeTurn, processMessage } from '../pipeline.js';
import type { CartSnapshot } from '../types.js';

const snapshot: CartSnapshot = {
  orderId: 'order-1',
  status: 'pending',
  items: [],
  totalPaise: 0,
  customerName: null,
  address: null,
  missing: ['name', 'address', 'items']
};

const baseInput = {
  vendorId: 'vendor-1',
  conversationId: 'conv-1',
  customerId: 'customer-1',
  customerPhone: '+911234567890',
  phoneNumberId: 'waba-phone-1',
  whatsappMessageId: 'wamid.1',
  snapshot,
  finalText: 'Here is your order summary.',
  language: 'en',
  intent: 'order_item',
  tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 100, completionTokens: 50 },
  costs: { aiCostMilli: 0, upstreamCostMilli: 0 }
};

beforeEach(() => {
  vi.clearAllMocks();
  persistTurnMock.mockResolvedValue({ assistantMessageId: 'assistant-msg-1' });
  messageProcessingUpdateMany.mockResolvedValue({ count: 1 });
  messageProcessingFindUnique.mockResolvedValue(null);
  debitAfterEnqueueMock.mockResolvedValue('debited');
  renderRejectedOpsReplyMock.mockReturnValue('rejected-ops reply');
  ensureMessageContentEnMock.mockResolvedValue(undefined);
  persistPendingOutboundMediaMock.mockResolvedValue([]);
  enrichCustomerInsightsIfNeededMock.mockResolvedValue(undefined);
});

describe('finalizeTurn', () => {
  it('persists before publishing, and publishes before debiting (§7 steps 8-10 order)', async () => {
    const callOrder: string[] = [];
    persistTurnMock.mockImplementation(async () => {
      callOrder.push('persist');
      return { assistantMessageId: 'assistant-msg-1' };
    });
    publishToQueueMock.mockImplementation(async () => {
      callOrder.push('publish');
    });
    debitAfterEnqueueMock.mockImplementation(async () => {
      callOrder.push('debit');
      return 'debited';
    });

    await finalizeTurn(baseInput);

    expect(callOrder).toEqual(['persist', 'publish', 'debit']);
  });

  it('publishes with phoneNumberId and messageId — the two fields missing from spec §19\'s example JSON', async () => {
    await finalizeTurn(baseInput);

    expect(publishToQueueMock).toHaveBeenCalledWith('https://sqs.example/response-queue', {
      type: 'text',
      to: '+911234567890',
      text: 'Here is your order summary.',
      conversationId: 'conv-1',
      vendorId: 'vendor-1',
      customerId: 'customer-1',
      phoneNumberId: 'waba-phone-1',
      messageId: 'assistant-msg-1',
      metadata: { intent: 'order_item', processor: 'conversation-v1', traceId: 'wamid.1' }
    });
  });

  it('marks MessageProcessing queued (with queuedAt) right after publish succeeds', async () => {
    await finalizeTurn(baseInput);

    const call = messageProcessingUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ whatsappMessageId: { in: ['wamid.1'] } });
    expect(call.data.status).toBe('queued');
    expect(call.data.queuedAt).toBeInstanceOf(Date);
  });

  it('returns publishedAt so callers can compute LatencyMs against the publish moment', async () => {
    const before = Date.now();
    const result = await finalizeTurn(baseInput);
    expect(result.publishedAt).toBeGreaterThanOrEqual(before);
    expect(result.publishedAt).toBeLessThanOrEqual(Date.now());
  });

  it('starts contentEn translation after publish without blocking the customer reply', async () => {
    await finalizeTurn(baseInput);

    expect(ensureMessageContentEnMock).toHaveBeenCalledWith('assistant-msg-1', baseInput.finalText);
  });

  it('does not rethrow when the inline debit fails, and logs DebitFail', async () => {
    debitAfterEnqueueMock.mockRejectedValue(new Error('wallet update failed'));

    await expect(finalizeTurn(baseInput)).resolves.toEqual({ publishedAt: expect.any(Number) });

    expect(logCountMock).toHaveBeenCalledWith('DebitFail', { vendorId: 'vendor-1', context: 'inline' });
  });

  it('propagates a persist failure (nothing has been sent to the customer yet, safe to retry)', async () => {
    persistTurnMock.mockRejectedValue(new Error('db down'));

    await expect(finalizeTurn(baseInput)).rejects.toThrow('db down');
    expect(publishToQueueMock).not.toHaveBeenCalled();
  });

  it('persists pending media after the text row and publishes attachments on the queue payload', async () => {
    const callOrder: string[] = [];
    persistTurnMock.mockImplementation(async () => {
      callOrder.push('persistText');
      return { assistantMessageId: 'assistant-msg-1' };
    });
    persistPendingOutboundMediaMock.mockImplementation(async () => {
      callOrder.push('persistMedia');
      return [{ messageId: 'img-1', productMediaId: 'pm-1', kind: 'image', caption: 'Photos' }];
    });

    await finalizeTurn({
      ...baseInput,
      intent: 'send_media',
      pendingMedia: [{ productMediaId: 'pm-1', kind: 'image', caption: 'Photos' }]
    });

    expect(callOrder).toEqual(['persistText', 'persistMedia']);
    expect(publishToQueueMock).toHaveBeenCalledWith('https://sqs.example/response-queue', {
      type: 'text',
      to: '+911234567890',
      text: 'Here is your order summary.',
      conversationId: 'conv-1',
      vendorId: 'vendor-1',
      customerId: 'customer-1',
      phoneNumberId: 'waba-phone-1',
      messageId: 'assistant-msg-1',
      attachments: [{ messageId: 'img-1', productMediaId: 'pm-1', kind: 'image', caption: 'Photos' }],
      metadata: { intent: 'send_media', processor: 'conversation-v1', traceId: 'wamid.1' }
    });
  });
});

describe('processMessage', () => {
  const identity = { vendorId: 'vendor-1', customerId: 'customer-1', conversationId: 'conv-1' };
  const rawInput = {
    vendorId: 'vendor-1',
    phoneNumberId: 'waba-phone-1',
    customerPhone: '+911234567890',
    content: '2 brownies please',
    whatsappMessageId: 'wamid.1'
  };
  const hotSet = {
    vendorConfig: { aiModel: 'gpt-4.1-mini' },
    compactCatalog: [],
    memory: null,
    pendingOrder: null,
    orderHistory: [],
    orderPaymentStatuses: [],
    faqs: [],
    insights: null,
    recentMessages: []
  };
  const llm1Result = {
    language: 'en',
    intent: 'order_item',
    ops: [{ type: 'add', productId: 'prod-1', qty: 2 }],
    draftReply: 'Sure, added 2 brownies!',
    confidence: 0.9,
    needsVerify: false,
    model: 'gpt-4.1-mini',
    promptTokens: 500,
    completionTokens: 40
  };
  const applyResult = { snapshot: { ...snapshot, orderId: 'order-1' }, mutated: true, rejectedOps: [] };

  beforeEach(() => {
    resolveIdentityMock.mockResolvedValue(identity);
    acquireLockMock.mockResolvedValue({ token: 'lock-token-1' });
    upsertInboundMessageMock.mockResolvedValue({ messageId: 'inbound-msg-1', alreadyProcessed: false });
    conversationFindUnique.mockResolvedValue({ aiPaused: false });
    canProcessMessageMock.mockResolvedValue({ allowed: true });
    collectCoalescedInboundMock.mockImplementation(async (_id: string, _wamid: string, content: string) => ({
      mergedContent: content,
      whatsappMessageIds: ['wamid.1'],
      primaryWhatsappMessageId: 'wamid.1'
    }));
    prefetchHotSetMock.mockResolvedValue(hotSet);
    runLlm1Mock.mockResolvedValue(llm1Result);
    applyMock.mockResolvedValue(applyResult);
    runLlm2Mock.mockResolvedValue({ skipped: true });
    selectFinalReplyMock.mockReturnValue({ finalReply: 'final text', usedEngineRenderer: false });
    persistTurnMock.mockResolvedValue({ assistantMessageId: 'assistant-msg-1' });
    publishToQueueMock.mockResolvedValue(undefined);
    debitAfterEnqueueMock.mockResolvedValue('debited');
    notifyVendorNewOrderMock.mockResolvedValue({ success: true, queued: true });
    sendTypingIndicatorMock.mockResolvedValue({ ok: true });
    notifyVendorOfPostSalesEventMock.mockResolvedValue(undefined);
    normalizeSetFieldOpsMock.mockImplementation(async (ops: unknown[]) => ops);
    ensureMessageContentEnMock.mockResolvedValue(undefined);
    persistKnowledgeGapIfNeededMock.mockResolvedValue(null);
    enrichCustomerInsightsIfNeededMock.mockResolvedValue(undefined);
    collectSendProductMediaOpsMock.mockReturnValue([]);
    resolveProductMediaAttachmentsMock.mockResolvedValue([]);
  });

  it('fires read+typing after guards pass, before prefetch/LLM-1', async () => {
    const callOrder: string[] = [];
    sendTypingIndicatorMock.mockImplementation(async () => {
      callOrder.push('typing');
      return { ok: true };
    });
    prefetchHotSetMock.mockImplementation(async () => {
      callOrder.push('prefetch');
      return hotSet;
    });
    runLlm1Mock.mockImplementation(async () => {
      callOrder.push('llm1');
      return llm1Result;
    });

    await processMessage(rawInput);

    expect(sendTypingIndicatorMock).toHaveBeenCalledOnce();
    expect(sendTypingIndicatorMock).toHaveBeenCalledWith('wamid.1', 'waba-phone-1');
    expect(callOrder.indexOf('typing')).toBeLessThan(callOrder.indexOf('prefetch'));
    expect(callOrder.indexOf('prefetch')).toBeLessThan(callOrder.indexOf('llm1'));
  });

  it('typing indicator failure does not block LLM or ProcessorSuccess', async () => {
    sendTypingIndicatorMock.mockRejectedValue(new Error('graph down'));

    await processMessage(rawInput);

    expect(runLlm1Mock).toHaveBeenCalled();
    expect(logCountMock).toHaveBeenCalledWith('ProcessorSuccess', { vendorId: 'vendor-1' });
  });

  it('happy path: runs the full pipeline, releases the lock, and reports ProcessorSuccess', async () => {
    await processMessage(rawInput);

    expect(resolveIdentityMock).toHaveBeenCalledWith({ vendorId: 'vendor-1', phoneNumberId: 'waba-phone-1', customerPhone: '+911234567890' });
    expect(acquireLockMock).toHaveBeenCalledWith('conv-1');
    expect(runLlm1Mock).toHaveBeenCalled();
    expect(applyMock).toHaveBeenCalled();
    expect(persistTurnMock).toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalledWith('conv-1', 'lock-token-1');
    expect(logCountMock).toHaveBeenCalledWith('ProcessorSuccess', { vendorId: 'vendor-1' });
  });

  it('forwards sourceMessageType=audio to LLM-1', async () => {
    await processMessage({ ...rawInput, sourceMessageType: 'audio' });

    expect(runLlm1Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        mergedContent: '2 brownies please',
        sourceMessageType: 'audio'
      })
    );
  });

  it('§23: logs the required timestamp checkpoints in order — handler_start, prefetch_done, llm1_done, cart_apply_done, response_queue_published', async () => {
    await processMessage(rawInput);

    const stages = logStageMock.mock.calls.map((call) => call[0]);
    expect(stages).toEqual([
      'handler_start',
      'prefetch_done',
      'context_plan_done',
      'llm1_done',
      'cart_apply_done',
      'llm2_skipped',
      'response_queue_published'
    ]);
  });

  it('§23: llm1_done carries promptTokens/completionTokens/model, and Llm1Ms is timed', async () => {
    await processMessage(rawInput);

    const llm1StageCall = logStageMock.mock.calls.find((call) => call[0] === 'llm1_done');
    expect(llm1StageCall?.[2]).toEqual(
      expect.objectContaining({ promptTokens: 500, completionTokens: 40, model: 'gpt-4.1-mini', fullCatalogSize: hotSet.compactCatalog.length })
    );
    expect(logLatencyMock).toHaveBeenCalledWith('Llm1Ms', expect.any(Number), { vendorId: 'vendor-1' });
  });

  it('threads catalogSlice to runLlm1 and selectFinalReply (full catalog when slicing off)', async () => {
    await processMessage(rawInput);

    expect(runLlm1Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogSlice: hotSet.compactCatalog,
        mergedContent: '2 brownies please'
      })
    );
    expect(selectFinalReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: llm1Result.intent,
        ops: llm1Result.ops,
        compactCatalog: hotSet.compactCatalog,
        language: llm1Result.language,
        cartMutated: applyResult.mutated
      })
    );
  });

  it('logs Llm2Skipped when LLM-2 does not run, or Llm2Ms when it does', async () => {
    await processMessage(rawInput);
    expect(logCountMock).toHaveBeenCalledWith('Llm2Skipped', { vendorId: 'vendor-1' });

    vi.clearAllMocks();
    resolveIdentityMock.mockResolvedValue(identity);
    acquireLockMock.mockResolvedValue({ token: 'lock-token-1' });
    upsertInboundMessageMock.mockResolvedValue({ messageId: 'inbound-msg-1', alreadyProcessed: false });
    conversationFindUnique.mockResolvedValue({ aiPaused: false });
    canProcessMessageMock.mockResolvedValue({ allowed: true });
    collectCoalescedInboundMock.mockImplementation(async (_id: string, _wamid: string, content: string) => ({
      mergedContent: content,
      whatsappMessageIds: ['wamid.1'],
      primaryWhatsappMessageId: 'wamid.1'
    }));
    prefetchHotSetMock.mockResolvedValue(hotSet);
    runLlm1Mock.mockResolvedValue(llm1Result);
    applyMock.mockResolvedValue(applyResult);
    runLlm2Mock.mockResolvedValue({ skipped: false, finalReply: 'polished', promptTokens: 1, completionTokens: 1 });
    selectFinalReplyMock.mockReturnValue({ finalReply: 'final text', usedEngineRenderer: false });
    persistTurnMock.mockResolvedValue({ assistantMessageId: 'assistant-msg-1' });

    await processMessage(rawInput);
    expect(logLatencyMock).toHaveBeenCalledWith('Llm2Ms', expect.any(Number), { vendorId: 'vendor-1' });
    expect(logCountMock).not.toHaveBeenCalledWith('Llm2Skipped', expect.anything());
  });

  it('emits LatencyMs measured start-to-publish, not including the debit attempt', async () => {
    await processMessage(rawInput);

    expect(logLatencyMock).toHaveBeenCalledWith('LatencyMs', expect.any(Number), { vendorId: 'vendor-1' });
  });

  it('lock contention: logs LockContention, stashes for coalesce, and ACKs without retry when stash succeeds', async () => {
    acquireLockMock.mockRejectedValue(new MockLockContentionError('locked'));
    stashForBurstMergeMock.mockResolvedValue(true);

    await expect(processMessage(rawInput)).resolves.toBeUndefined();

    expect(logCountMock).toHaveBeenCalledWith('LockContention', { vendorId: 'vendor-1' });
    expect(stashForBurstMergeMock).toHaveBeenCalledWith('conv-1', 'wamid.1', '2 brownies please');
    expect(runLlm1Mock).not.toHaveBeenCalled();
    expect(sendTypingIndicatorMock).not.toHaveBeenCalled();
  });

  it('lock contention: rethrows when Redis stash fails so SQS can retry', async () => {
    acquireLockMock.mockRejectedValue(new MockLockContentionError('locked'));
    stashForBurstMergeMock.mockResolvedValue(false);

    await expect(processMessage(rawInput)).rejects.toThrow(MockLockContentionError);
  });

  it('lock unavailable (Redis down): logs LockUnavailable, does NOT stash, still rethrows', async () => {
    acquireLockMock.mockRejectedValue(new MockLockUnavailableError('redis down'));

    await expect(processMessage(rawInput)).rejects.toThrow(MockLockUnavailableError);

    expect(logCountMock).toHaveBeenCalledWith('LockUnavailable', { vendorId: 'vendor-1' });
    expect(stashForBurstMergeMock).not.toHaveBeenCalled();
    expect(sendTypingIndicatorMock).not.toHaveBeenCalled();
  });

  it('CartEngine.apply failure: logs CartApplyFail before rethrowing', async () => {
    applyMock.mockRejectedValue(new Error('deadlock'));

    await expect(processMessage(rawInput)).rejects.toThrow('deadlock');

    expect(logCountMock).toHaveBeenCalledWith('CartApplyFail', { vendorId: 'vendor-1' });
  });

  it('duplicate whatsappMessageId: returns early (success exit), never runs LLM-1, still releases the lock', async () => {
    // Gate is MessageProcessing (written once persist.ts has actually produced
    // a reply), not the customer Message row -- that row can now legitimately
    // already exist (created upfront by the webhook handler) on a message's
    // very first delivery to this pipeline, so it can't be used as the signal.
    messageProcessingFindUnique.mockResolvedValue({ id: 'mp-1' });

    await processMessage(rawInput);

    expect(runLlm1Mock).not.toHaveBeenCalled();
    expect(persistTurnMock).not.toHaveBeenCalled();
    expect(upsertInboundMessageMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalled();
    expect(sendTypingIndicatorMock).not.toHaveBeenCalled();
  });

  it('aiPaused guard: stores inbound only, no LLM, no reply published, no debit', async () => {
    conversationFindUnique.mockResolvedValue({ aiPaused: true });

    await processMessage(rawInput);

    expect(ensureMessageContentEnMock).toHaveBeenCalledWith('inbound-msg-1', rawInput.content);
    expect(runLlm1Mock).not.toHaveBeenCalled();
    expect(publishToQueueMock).not.toHaveBeenCalled();
    expect(debitAfterEnqueueMock).not.toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalled();
    expect(sendTypingIndicatorMock).not.toHaveBeenCalled();
  });

  it('normalizes non-English set_field ops to English before CartEngine.apply', async () => {
    const tamilOps = [{ type: 'set_field' as const, field: 'name' as const, value: 'ராஜி' }];
    const englishOps = [{ type: 'set_field' as const, field: 'name' as const, value: 'Raji' }];
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: tamilOps });
    normalizeSetFieldOpsMock.mockResolvedValue(englishOps);

    await processMessage(rawInput);

    expect(normalizeSetFieldOpsMock).toHaveBeenCalledWith(tamilOps);
    expect(applyMock).toHaveBeenCalledWith(
      expect.objectContaining({ ops: englishOps })
    );
  });

  it('wallet guard: publishes the templated reply, no LLM, no debit', async () => {
    canProcessMessageMock.mockResolvedValue({ allowed: false, reason: 'insufficient_balance' });

    await processMessage(rawInput);

    expect(canProcessMessageMock).toHaveBeenCalledWith('vendor-1', 'text', { assistantTurnWorstCaseMedia: true });
    expect(runLlm1Mock).not.toHaveBeenCalled();
    expect(debitAfterEnqueueMock).not.toHaveBeenCalled();
    const publishCall = publishToQueueMock.mock.calls[0][1];
    expect(publishCall.to).toBe('+911234567890');
    expect(publishCall.metadata.intent).toBe('guard_no_credit');
    expect(sendTypingIndicatorMock).not.toHaveBeenCalled();
  });

  it('handoff op: uses triggerHandoff\'s customerMessage as the final reply, skips LLM-2/selectFinalReply', async () => {
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: [{ type: 'handoff' }] });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });
    triggerHandoffMock.mockResolvedValue({ customerMessage: "I've passed this to our team!" });

    await processMessage(rawInput);

    expect(triggerHandoffMock).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      vendorId: 'vendor-1',
      customerId: 'customer-1',
      phoneNumberId: 'waba-phone-1',
      traceId: 'wamid.1',
      category: null,
      details: null,
      orderNumber: null
    });
    expect(runLlm2Mock).not.toHaveBeenCalled();
    expect(selectFinalReplyMock).not.toHaveBeenCalled();
    const persistCall = persistTurnMock.mock.calls[0][0];
    expect(persistCall.finalText).toBe("I've passed this to our team!");
  });

  it('postSalesOutcome (refund_request_received): renders the deterministic reply, skips LLM-2, does not alert the vendor', async () => {
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: [{ type: 'refund_request', orderNumber: 'ORD-1', reason: null }] });
    applyMock.mockResolvedValue({
      snapshot,
      mutated: false,
      rejectedOps: [],
      postSalesOutcome: {
        type: 'refund_request_received',
        orderId: 'order-hist-1',
        orderNumber: 'ORD-1',
        detail: 'The shop will review and confirm your refund.'
      }
    });

    await processMessage(rawInput);

    expect(runLlm2Mock).not.toHaveBeenCalled();
    expect(selectFinalReplyMock).not.toHaveBeenCalled();
    expect(notifyVendorOfPostSalesEventMock).not.toHaveBeenCalled();
    const persistCall = persistTurnMock.mock.calls[0][0];
    expect(persistCall.finalText).toContain("we've noted your refund request for order ORD-1");
  });

  it('postSalesOutcome (refund_denied): renders the deterministic reply and alerts the vendor (Tier 2)', async () => {
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: [{ type: 'refund_request', orderNumber: 'ORD-2', reason: null }] });
    applyMock.mockResolvedValue({
      snapshot,
      mutated: false,
      rejectedOps: [],
      postSalesOutcome: { type: 'refund_denied', orderId: 'order-hist-2', orderNumber: 'ORD-2', detail: 'Refund request is outside the 7-day window.' }
    });

    await processMessage(rawInput);
    await new Promise((resolve) => setImmediate(resolve)); // fire-and-forget notify

    expect(runLlm2Mock).not.toHaveBeenCalled();
    const persistCall = persistTurnMock.mock.calls[0][0];
    expect(persistCall.finalText).toContain("isn't eligible for an automatic refund");
    expect(notifyVendorOfPostSalesEventMock).toHaveBeenCalledWith({
      vendorId: 'vendor-1',
      phoneNumberId: 'waba-phone-1',
      conversationId: 'conv-1',
      traceId: 'wamid.1',
      orderId: 'order-hist-2',
      orderNumber: 'ORD-2',
      category: 'refund_denied',
      detail: 'Refund request is outside the 7-day window.',
      aiPaused: false
    });
  });

  it('postSalesOutcome (not_cancellable_at_this_stage): renders the deterministic reply and alerts the vendor as cancel_in_progress', async () => {
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: [{ type: 'cancel', orderNumber: 'ORD-3' }] });
    applyMock.mockResolvedValue({
      snapshot,
      mutated: false,
      rejectedOps: [{ op: { type: 'cancel', orderNumber: 'ORD-3' }, reason: 'not_cancellable_at_this_stage' }],
      postSalesOutcome: { type: 'not_cancellable_at_this_stage', orderId: 'order-hist-3', orderNumber: 'ORD-3', detail: 'Order is already preparing and can no longer be cancelled automatically.' }
    });

    await processMessage(rawInput);
    await new Promise((resolve) => setImmediate(resolve));

    const persistCall = persistTurnMock.mock.calls[0][0];
    expect(persistCall.finalText).toContain("can't cancel order ORD-3 automatically");
    expect(notifyVendorOfPostSalesEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'cancel_in_progress', orderNumber: 'ORD-3' })
    );
  });

  it('postSalesOutcome (order_cancelled): renders the deterministic reply, no vendor alert needed', async () => {
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: [{ type: 'cancel', orderNumber: 'ORD-4' }] });
    applyMock.mockResolvedValue({
      snapshot,
      mutated: true,
      rejectedOps: [],
      postSalesOutcome: { type: 'order_cancelled', orderId: 'order-hist-4', orderNumber: 'ORD-4', detail: 'Cancelled as requested.' }
    });

    await processMessage(rawInput);

    expect(notifyVendorOfPostSalesEventMock).not.toHaveBeenCalled();
    const persistCall = persistTurnMock.mock.calls[0][0];
    expect(persistCall.finalText).toBe('Order ORD-4 has been cancelled as requested. What would you like to add?');
  });

  it('postSalesOutcome (already_cancelled): says the order is already cancelled and does not alert the vendor', async () => {
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: [{ type: 'cancel', orderNumber: 'ORD-5' }] });
    applyMock.mockResolvedValue({
      snapshot,
      mutated: false,
      rejectedOps: [],
      postSalesOutcome: { type: 'already_cancelled', orderId: 'order-hist-5', orderNumber: 'ORD-5', detail: 'Order is already cancelled.' }
    });

    await processMessage(rawInput);
    await new Promise((resolve) => setImmediate(resolve));

    expect(notifyVendorOfPostSalesEventMock).not.toHaveBeenCalled();
    const persistCall = persistTurnMock.mock.calls[0][0];
    expect(persistCall.finalText).toBe('Order ORD-5 is already cancelled.');
  });

  it('successful confirm: fire-and-forget notifies the vendor of the new order', async () => {
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: [{ type: 'confirm' }] });
    applyMock.mockResolvedValue({ snapshot: { ...snapshot, orderId: 'order-99', missing: [] }, mutated: true, rejectedOps: [] });

    await processMessage(rawInput);
    await new Promise((resolve) => setImmediate(resolve)); // fire-and-forget notify

    expect(notifyVendorNewOrderMock).toHaveBeenCalledWith('vendor-1', 'order-99');
  });

  it('rejected confirm: does NOT notify the vendor, and grounds the reply instead of trusting LLM-1/LLM-2', async () => {
    const confirmOp = { type: 'confirm' as const };
    const rejectedOps = [{ op: confirmOp, reason: 'missing_address' }];
    runLlm1Mock.mockResolvedValue({ ...llm1Result, ops: [confirmOp] });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps });

    await processMessage(rawInput);
    await new Promise((resolve) => setImmediate(resolve));

    expect(notifyVendorNewOrderMock).not.toHaveBeenCalled();
    expect(renderRejectedOpsReplyMock).toHaveBeenCalledWith(rejectedOps, snapshot, llm1Result.language, llm1Result.draftReply);
    expect(runLlm2Mock).not.toHaveBeenCalled();
    expect(selectFinalReplyMock).not.toHaveBeenCalled();
    expect(persistTurnMock).toHaveBeenCalledWith(expect.objectContaining({ finalText: 'rejected-ops reply' }));
  });

  it('always releases the lock, even when a step mid-pipeline throws, and classifies the error for ProcessorError', async () => {
    runLlm1Mock.mockRejectedValue(new Error('OpenAI 500'));

    await expect(processMessage(rawInput)).rejects.toThrow('OpenAI 500');

    expect(releaseLockMock).toHaveBeenCalledWith('conv-1', 'lock-token-1');
    expect(logCountMock).toHaveBeenCalledWith('ProcessorError', { vendorId: 'vendor-1', class: 'unknown' });
  });

  it('classifies a lock-contention ProcessorError with class:lock_contention', async () => {
    acquireLockMock.mockRejectedValue(new MockLockContentionError('locked'));

    // Lock failures throw before entering the try/finally that emits
    // ProcessorError (they're not yet holding a lock to release either) —
    // confirm no ProcessorError is double-counted on top of LockContention.
    await expect(processMessage(rawInput)).rejects.toThrow(MockLockContentionError);
    expect(logCountMock).not.toHaveBeenCalledWith('ProcessorError', expect.anything());
  });

  const pendingOrderHistory = [
    {
      id: 'order-hist-9790',
      orderNumber: 'ORD-IBELL-0042',
      items: [{ productId: 'prod-tin', name: 'Premium Baking Tin', quantity: 1, unit: 'pc' }],
      totalAmount: 129900,
      status: 'pending',
      createdAt: new Date('2026-09-02T07:48:07.000Z'),
      estimatedDelivery: null,
      confirmedAt: null,
      preparedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      cancellationReason: null
    }
  ];

  it('D6: 9790690170-style order deferral is rewritten from RECENT ORDERS and skips LLM-2', async () => {
    prefetchHotSetMock.mockResolvedValue({ ...hotSet, orderHistory: pendingOrderHistory });
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      intent: 'query',
      ops: [{ type: 'noop' }],
      draftReply: 'I will check the current status and get back to you',
      needsVerify: false,
      confidence: 0.95
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });

    await processMessage({
      ...rawInput,
      content: 'Na order pannen. Eappo kidaikum? Are you still checking my order status??'
    });

    expect(runLlm2Mock).not.toHaveBeenCalled();
    expect(selectFinalReplyMock).not.toHaveBeenCalled();
    expect(logCountMock).toHaveBeenCalledWith('CustomerQueryBlockedOrder', { vendorId: 'vendor-1' });
    const persistCall = persistTurnMock.mock.calls[0][0];
    expect(persistCall.finalText).toContain('ORD-IBELL-0042');
    expect(persistCall.finalText).not.toMatch(/get back/i);
    expect(persistCall.finalText).toContain('Premium Baking Tin');
  });

  it('D6: empty order history answers that nothing is on file and still skips LLM-2', async () => {
    prefetchHotSetMock.mockResolvedValue({ ...hotSet, orderHistory: [] });
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      intent: 'query',
      ops: [{ type: 'noop' }],
      draftReply: "I'm still checking your order.",
      needsVerify: false
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });

    await processMessage({ ...rawInput, content: "where's my order" });

    expect(runLlm2Mock).not.toHaveBeenCalled();
    expect(logCountMock).toHaveBeenCalledWith('CustomerQueryBlockedOrder', { vendorId: 'vendor-1' });
    expect(persistTurnMock.mock.calls[0][0].finalText).toMatch(/don'?t see an order on file/i);
  });

  it('D6: handoff still wins over an order-status deferral rewrite', async () => {
    prefetchHotSetMock.mockResolvedValue({ ...hotSet, orderHistory: pendingOrderHistory });
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      intent: 'query',
      ops: [{ type: 'handoff', category: 'complaint', details: 'wrong item', orderNumber: 'ORD-IBELL-0042' }],
      draftReply: 'I will check and get back to you'
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });
    triggerHandoffMock.mockResolvedValue({ customerMessage: "I've passed this to our team!" });

    await processMessage({ ...rawInput, content: 'my last order arrived damaged' });

    expect(triggerHandoffMock).toHaveBeenCalled();
    expect(runLlm2Mock).not.toHaveBeenCalled();
    expect(logCountMock).not.toHaveBeenCalledWith('CustomerQueryBlockedOrder', expect.anything());
    expect(persistTurnMock.mock.calls[0][0].finalText).toBe("I've passed this to our team!");
  });

  it('D6: a draft that already cites the real order number is left on the LLM-2 path', async () => {
    prefetchHotSetMock.mockResolvedValue({ ...hotSet, orderHistory: pendingOrderHistory });
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      intent: 'query',
      ops: [{ type: 'noop' }],
      draftReply: 'Your order ORD-IBELL-0042 is pending — Premium Baking Tin x1.',
      needsVerify: false,
      confidence: 0.99
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });

    await processMessage({ ...rawInput, content: "where's my order" });

    expect(runLlm2Mock).toHaveBeenCalled();
    expect(selectFinalReplyMock).toHaveBeenCalled();
    expect(logCountMock).not.toHaveBeenCalledWith('CustomerQueryBlockedOrder', expect.anything());
  });

  it('send_product_media: resolves attachments and publishes queue shape (no media on D6)', async () => {
    const mediaOp = { type: 'send_product_media' as const, productId: 'prod-cake', kind: 'image' as const };
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      intent: 'send_media',
      ops: [mediaOp],
      draftReply: 'Here are photos of the cake.',
      needsVerify: false
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });
    collectSendProductMediaOpsMock.mockReturnValue([mediaOp]);
    resolveProductMediaAttachmentsMock.mockResolvedValue([
      { productMediaId: 'pm-1', kind: 'image', caption: 'Here are photos of the cake.' }
    ]);
    persistPendingOutboundMediaMock.mockResolvedValue([
      { messageId: 'img-1', productMediaId: 'pm-1', kind: 'image', caption: 'Here are photos of the cake.' }
    ]);

    await processMessage({ ...rawInput, content: 'send cake photo' });

    expect(publishToQueueMock).toHaveBeenCalledWith(
      'https://sqs.example/response-queue',
      expect.objectContaining({
        attachments: [
          { messageId: 'img-1', productMediaId: 'pm-1', kind: 'image', caption: 'Here are photos of the cake.' }
        ],
        metadata: expect.objectContaining({ intent: 'send_media' })
      })
    );
  });

  it('send_product_media: order-status turn does not resolve or publish attachments', async () => {
    const mediaOp = { type: 'send_product_media' as const, productId: 'prod-cake', kind: 'image' as const };
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      intent: 'order_status',
      ops: [mediaOp],
      draftReply: 'Checking…',
      needsVerify: false
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });
    collectSendProductMediaOpsMock.mockReturnValue([mediaOp]);

    await processMessage({ ...rawInput, content: "where's my order" });

    expect(resolveProductMediaAttachmentsMock).not.toHaveBeenCalled();
    expect(publishToQueueMock).toHaveBeenCalledWith(
      'https://sqs.example/response-queue',
      expect.not.objectContaining({ attachments: expect.anything() })
    );
  });

  it('knowledge_gap: persists a CustomerQuery and does not pause AI', async () => {
    persistKnowledgeGapIfNeededMock.mockResolvedValue({ id: 'query-1', deduped: false });
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      intent: 'query',
      ops: [{ type: 'knowledge_gap', question: 'Does the baking tin include dividers?', category: 'product', productId: 'prod-tin' }],
      draftReply: "I'll check with the team and get back to you shortly.",
      needsVerify: false,
      confidence: 0.95
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });

    await processMessage({ ...rawInput, content: 'Ithuku dividers varuma??' });

    expect(persistKnowledgeGapIfNeededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: 'vendor-1',
        conversationId: 'conv-1',
        customerId: 'customer-1',
        sourceMessageId: 'inbound-msg-1',
        customerText: 'Ithuku dividers varuma??',
        orderStatusTurn: false,
        hasHandoff: false,
        sandbox: false
      })
    );
    expect(triggerHandoffMock).not.toHaveBeenCalled();
    expect(conversationFindUnique).toHaveBeenCalledWith({ where: { id: 'conv-1' }, select: { aiPaused: true } });
    expect(persistTurnMock).toHaveBeenCalled();
  });

  it('handoff + knowledge_gap: persist is told handoff won, so no query is opened', async () => {
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      ops: [
        { type: 'handoff', category: 'complaint', details: 'damaged', orderNumber: null },
        { type: 'knowledge_gap', question: 'Is a replacement available?', category: 'other', productId: null }
      ],
      draftReply: "I'll check with the team."
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });
    triggerHandoffMock.mockResolvedValue({ customerMessage: "I've passed this to our team!" });

    await processMessage({ ...rawInput, content: 'item arrived damaged, do you have a spare?' });

    expect(triggerHandoffMock).toHaveBeenCalled();
    expect(persistKnowledgeGapIfNeededMock).toHaveBeenCalledWith(expect.objectContaining({ hasHandoff: true }));
  });

  it('D6: order-status turn does not open a CustomerQuery even when draft is a deferral', async () => {
    prefetchHotSetMock.mockResolvedValue({ ...hotSet, orderHistory: pendingOrderHistory });
    runLlm1Mock.mockResolvedValue({
      ...llm1Result,
      intent: 'query',
      ops: [{ type: 'knowledge_gap', question: 'Where is the order?', category: 'other', productId: null }],
      draftReply: 'I will check the current status and get back to you'
    });
    applyMock.mockResolvedValue({ snapshot, mutated: false, rejectedOps: [] });

    await processMessage({ ...rawInput, content: 'Are you still checking my order status??' });

    expect(persistKnowledgeGapIfNeededMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderStatusTurn: true, hasHandoff: false })
    );
    expect(logCountMock).toHaveBeenCalledWith('CustomerQueryBlockedOrder', { vendorId: 'vendor-1' });
  });

  it('sandbox: persist is invoked with sandbox true so it skips DB writes', async () => {
    await processMessage({ ...rawInput, sandbox: true });

    expect(persistKnowledgeGapIfNeededMock).toHaveBeenCalledWith(expect.objectContaining({ sandbox: true }));
  });
});
