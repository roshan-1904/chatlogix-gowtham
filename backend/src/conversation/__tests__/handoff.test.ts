import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeHandoffMock = vi.fn();
vi.mock('../../services/humanHandoffService.js', () => ({
  humanHandoffService: { executeHandoff: (...args: unknown[]) => executeHandoffMock(...args) }
}));

const vendorFindUnique = vi.fn();
const orderFindFirst = vi.fn();
const orderAlertCreate = vi.fn();
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
    order: { findFirst: (...args: unknown[]) => orderFindFirst(...args) },
    orderAlert: { create: (...args: unknown[]) => orderAlertCreate(...args) }
  }
}));

vi.mock('../../config/env.js', () => ({
  env: { RESPONSE_QUEUE_URL: 'https://sqs.example/response-queue' }
}));

const publishToQueueMock = vi.fn();
vi.mock('../../queue/sqsClient.js', () => ({
  publishToQueue: (...args: unknown[]) => publishToQueueMock(...args)
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { triggerHandoff } from '../handoff.js';

const baseInput = {
  conversationId: 'conv-1',
  vendorId: 'vendor-1',
  customerId: 'customer-1',
  phoneNumberId: 'waba-phone-1',
  traceId: 'wamid.1'
};

/** Fire-and-forget vendor notify runs after triggerHandoff resolves — flush pending microtasks/ticks before asserting on it. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  vi.clearAllMocks();
  publishToQueueMock.mockResolvedValue(undefined);
  orderFindFirst.mockResolvedValue(null);
  orderAlertCreate.mockResolvedValue({});
});

describe('triggerHandoff', () => {
  it('returns the canned customer message from humanHandoffService.executeHandoff', async () => {
    executeHandoffMock.mockResolvedValue({ message: 'Passed to our team!', success: true });
    vendorFindUnique.mockResolvedValue({ phone: '+91999999999' });

    const result = await triggerHandoff(baseInput);

    expect(result).toEqual({ customerMessage: 'Passed to our team!' });
    expect(executeHandoffMock).toHaveBeenCalledWith('conv-1', 'vendor-1');
  });

  it('notifies the vendor (fire-and-forget) with the correct payload shape when the pause succeeded', async () => {
    executeHandoffMock.mockResolvedValue({ message: 'Passed to our team!', success: true });
    vendorFindUnique.mockResolvedValue({ phone: '+91999999999' });

    await triggerHandoff(baseInput);
    await flush();

    expect(publishToQueueMock).toHaveBeenCalledWith('https://sqs.example/response-queue', {
      type: 'text',
      to: '+91999999999',
      text: expect.any(String),
      vendorId: 'vendor-1',
      phoneNumberId: 'waba-phone-1',
      metadata: { notificationType: 'other', conversationId: 'conv-1', traceId: 'wamid.1' }
    });
  });

  it('sends the category-specific message and writes an OrderAlert when the handoff op carries a complaint + a resolvable orderNumber', async () => {
    executeHandoffMock.mockResolvedValue({ message: 'Passed to our team!', success: true });
    vendorFindUnique.mockResolvedValue({ phone: '+91999999999' });
    orderFindFirst.mockResolvedValue({ id: 'order-1' });

    await triggerHandoff({
      ...baseInput,
      category: 'complaint',
      details: 'Item arrived damaged',
      orderNumber: 'ORD-TEST-0001'
    });
    await flush();

    expect(orderFindFirst).toHaveBeenCalledWith({
      where: { orderNumber: 'ORD-TEST-0001', customerId: 'customer-1', vendorId: 'vendor-1' },
      select: { id: true }
    });
    expect(orderAlertCreate).toHaveBeenCalledWith({
      data: { orderId: 'order-1', type: 'complaint', severity: 'high', message: 'Item arrived damaged' }
    });
    const [, payload] = publishToQueueMock.mock.calls[0];
    expect(payload.text).toContain('Customer Complaint');
    expect(payload.text).toContain('ORD-TEST-0001');
    expect(payload.text).toContain('Item arrived damaged');
    expect(payload.text).toContain('AI has been paused');
    expect(payload.metadata).toEqual({ notificationType: 'complaint', conversationId: 'conv-1', traceId: 'wamid.1' });
  });

  it('skips the OrderAlert (but still notifies) when the orderNumber does not resolve to a real order', async () => {
    executeHandoffMock.mockResolvedValue({ message: 'Passed to our team!', success: true });
    vendorFindUnique.mockResolvedValue({ phone: '+91999999999' });
    orderFindFirst.mockResolvedValue(null);

    await triggerHandoff({ ...baseInput, category: 'return', details: 'Wants to return', orderNumber: 'ORD-NOPE' });
    await flush();

    expect(orderAlertCreate).not.toHaveBeenCalled();
    expect(publishToQueueMock).toHaveBeenCalledTimes(1);
    expect(publishToQueueMock.mock.calls[0][1].text).toContain('ORD-NOPE'); // still reports what the customer said, just no alert row to attach
  });

  it('does not notify the vendor when the pause itself failed (aiPaused was not actually set)', async () => {
    executeHandoffMock.mockResolvedValue({ message: "I've notified the team...", success: false });

    await triggerHandoff(baseInput);
    await flush();

    expect(vendorFindUnique).not.toHaveBeenCalled();
    expect(publishToQueueMock).not.toHaveBeenCalled();
  });

  it('skips the notify gracefully (no throw) when the vendor has no phone on file', async () => {
    executeHandoffMock.mockResolvedValue({ message: 'Passed to our team!', success: true });
    vendorFindUnique.mockResolvedValue({ phone: null });

    await triggerHandoff(baseInput);
    await flush();

    expect(publishToQueueMock).not.toHaveBeenCalled();
  });

  it('does not let a notify failure reject triggerHandoff itself (I5: never block the customer send)', async () => {
    executeHandoffMock.mockResolvedValue({ message: 'Passed to our team!', success: true });
    vendorFindUnique.mockRejectedValue(new Error('db down'));

    await expect(triggerHandoff(baseInput)).resolves.toEqual({ customerMessage: 'Passed to our team!' });
    await flush(); // let the rejected notify promise's .catch() run so it doesn't surface as an unhandled rejection
  });
});
