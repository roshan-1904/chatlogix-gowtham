import { describe, it, expect, vi, beforeEach } from 'vitest';

const messageCreate = vi.fn();
const customerInsightsUpsert = vi.fn();
const conversationMemoryUpsert = vi.fn();
const messageProcessingUpsert = vi.fn();
const orderFindUnique = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: { create: (...args: unknown[]) => messageCreate(...args) },
    customerInsights: { upsert: (...args: unknown[]) => customerInsightsUpsert(...args) },
    conversationMemory: { upsert: (...args: unknown[]) => conversationMemoryUpsert(...args) },
    messageProcessing: { upsert: (...args: unknown[]) => messageProcessingUpsert(...args) },
    order: { findUnique: (...args: unknown[]) => orderFindUnique(...args) },
    // The real Prisma array-form $transaction just awaits every operation
    // together; each `prisma.x.y(...)` call above already returns a Promise
    // from the mock, so Promise.all reproduces the same ordered-results
    // behavior for testing purposes.
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops)
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const invalidateCustomerContext = vi.fn();
const ensureMessageContentEn = vi.fn();
vi.mock('../prefetch.js', () => ({
  invalidateCustomerContext: (...args: unknown[]) => invalidateCustomerContext(...args)
}));
vi.mock('../../utils/vendorEnglish.js', () => ({
  ensureMessageContentEn: (...args: unknown[]) => ensureMessageContentEn(...args)
}));

import { persistTurn } from '../persist.js';
import type { CartSnapshot } from '../types.js';

const VENDOR_ID = 'vendor-1';
const CONVERSATION_ID = 'conv-1';
const CUSTOMER_ID = 'customer-1';

function snapshot(overrides: Partial<CartSnapshot> = {}): CartSnapshot {
  return {
    orderId: 'order-1',
    status: 'pending',
    items: [{ productId: 'prod-1', name: 'Brownie', quantity: 2, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 20000 }],
    totalPaise: 20000,
    customerName: null,
    address: null,
    missing: ['name', 'address'],
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  messageCreate.mockResolvedValue({ id: 'assistant-msg-1' });
  customerInsightsUpsert.mockResolvedValue({});
  conversationMemoryUpsert.mockResolvedValue({});
  messageProcessingUpsert.mockResolvedValue({});
  orderFindUnique.mockResolvedValue(null);
  ensureMessageContentEn.mockResolvedValue(undefined);
});

describe('persistTurn', () => {
  it('creates the assistant Message with token/cost fields and returns its id', async () => {
    const result = await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot(),
      finalText: 'Added 2 Brownies!',
      language: 'en',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 500, completionTokens: 50 },
      whatsappMessageId: 'wamid.1'
    });

    expect(result.assistantMessageId).toBe('assistant-msg-1');
    const data = messageCreate.mock.calls[0][0].data;
    expect(data.senderType).toBe('assistant');
    expect(data.content).toBe('Added 2 Brownies!');
    expect(data.aiPromptTokens).toBe(500);
    expect(data.aiCompletionTokens).toBe(50);
    expect(data.aiTokensUsed).toBe(550);
    expect(data.aiPrimaryModel).toBe('gpt-4.1-mini');
    expect(data.aiCostUsd).toBeGreaterThan(0);
  });

  it('only writes customerName/address to CustomerInsights when the snapshot has them', async () => {
    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot({ customerName: null, address: null }),
      finalText: 'x',
      language: 'en',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 1, completionTokens: 1 },
      whatsappMessageId: 'wamid.2'
    });

    const update = customerInsightsUpsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('customerName');
    expect(update).not.toHaveProperty('deliveryAddress');
    expect(update.preferredLanguage).toBe('en');
  });

  it('writes customerName/address to CustomerInsights when the snapshot has them', async () => {
    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot({ customerName: 'Priya', address: '123 Main St' }),
      finalText: 'x',
      language: 'ta',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 1, completionTokens: 1 },
      whatsappMessageId: 'wamid.3'
    });

    const update = customerInsightsUpsert.mock.calls[0][0].update;
    expect(update.customerName).toBe('Priya');
    expect(update.deliveryAddress).toBe('123 Main St');
    expect(update.primaryDeliveryAddress).toBe('123 Main St');
  });

  it('invalidates the customer-insights/pending-order caches when the snapshot carries a name or address', async () => {
    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot({ customerName: 'Priya', address: null }),
      finalText: 'x',
      language: 'en',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 1, completionTokens: 1 },
      whatsappMessageId: 'wamid.8'
    });
    expect(invalidateCustomerContext).toHaveBeenCalledWith(CUSTOMER_ID, VENDOR_ID, CONVERSATION_ID);
  });

  it('does not invalidate the customer-insights/pending-order caches when the snapshot has neither', async () => {
    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot({ customerName: null, address: null }),
      finalText: 'x',
      language: 'en',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 1, completionTokens: 1 },
      whatsappMessageId: 'wamid.9'
    });
    expect(invalidateCustomerContext).not.toHaveBeenCalled();
  });

  it('increments turnNumber on ConversationMemory update but starts at 1 on create', async () => {
    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot(),
      finalText: 'x',
      language: 'en',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 1, completionTokens: 1 },
      whatsappMessageId: 'wamid.4'
    });

    const call = conversationMemoryUpsert.mock.calls[0][0];
    expect(call.create.turnNumber).toBe(1);
    expect(call.update.turnNumber).toEqual({ increment: 1 });
  });

  it('derives "confirming" stage when the cart is complete and pending, "ordering" when items exist but something is missing', async () => {
    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot({ missing: [] }),
      finalText: 'x',
      language: 'en',
      intent: 'confirm',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 1, completionTokens: 1 },
      whatsappMessageId: 'wamid.5'
    });
    expect(conversationMemoryUpsert.mock.calls[0][0].update.conversationStage).toBe('confirming');

    vi.clearAllMocks();
    conversationMemoryUpsert.mockResolvedValue({});
    messageCreate.mockResolvedValue({ id: 'assistant-msg-2' });

    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot({ missing: ['address'] }),
      finalText: 'x',
      language: 'en',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 1, completionTokens: 1 },
      whatsappMessageId: 'wamid.6'
    });
    expect(conversationMemoryUpsert.mock.calls[0][0].update.conversationStage).toBe('ordering');
  });

  it('upserts MessageProcessing to status "applied", keyed on whatsappMessageId', async () => {
    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot(),
      finalText: 'x',
      language: 'en',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 10, completionTokens: 20 },
      whatsappMessageId: 'wamid.7'
    });

    const call = messageProcessingUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ whatsappMessageId: 'wamid.7' });
    expect(call.update.status).toBe('applied');
    expect(call.create.status).toBe('applied');
  });

  it('keeps assistant content as finalText (customer language)', async () => {
    const tamilReply = 'உங்கள் ஆர்டர் சேர்க்கப்பட்டது';
    await persistTurn({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      snapshot: snapshot(),
      finalText: tamilReply,
      language: 'ta',
      intent: 'order_item',
      tokenMeta: { model: 'gpt-4.1-mini', promptTokens: 1, completionTokens: 1 },
      whatsappMessageId: 'wamid.10'
    });

    expect(messageCreate.mock.calls[0][0].data.content).toBe(tamilReply);
    expect(ensureMessageContentEn).not.toHaveBeenCalled();
  });
});
