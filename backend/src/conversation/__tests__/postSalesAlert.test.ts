import { describe, it, expect, vi, beforeEach } from 'vitest';

const vendorFindUnique = vi.fn();
const orderAlertCreate = vi.fn();
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
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

import { notifyVendorOfPostSalesEvent } from '../postSalesAlert.js';

const baseInput = {
  vendorId: 'vendor-1',
  phoneNumberId: 'waba-phone-1',
  conversationId: 'conv-1',
  traceId: 'wamid.1',
  orderId: 'order-1',
  orderNumber: 'ORD-TEST-0001',
  category: 'complaint' as const,
  detail: 'Item arrived damaged'
};

beforeEach(() => {
  vi.clearAllMocks();
  vendorFindUnique.mockResolvedValue({ phone: '+91999999999' });
  orderAlertCreate.mockResolvedValue({});
  publishToQueueMock.mockResolvedValue(undefined);
});

describe('notifyVendorOfPostSalesEvent', () => {
  it('writes an OrderAlert with the category as type when orderId is given', async () => {
    await notifyVendorOfPostSalesEvent(baseInput);

    expect(orderAlertCreate).toHaveBeenCalledWith({
      data: { orderId: 'order-1', type: 'complaint', severity: 'high', message: 'Item arrived damaged' }
    });
  });

  it('skips the OrderAlert when orderId is null', async () => {
    await notifyVendorOfPostSalesEvent({ ...baseInput, orderId: null, orderNumber: null });

    expect(orderAlertCreate).not.toHaveBeenCalled();
    expect(publishToQueueMock).toHaveBeenCalledTimes(1); // still notifies
  });

  it('sends category-appropriate copy for each category', async () => {
    await notifyVendorOfPostSalesEvent({ ...baseInput, category: 'return', detail: 'Wants to return item' });
    expect(publishToQueueMock.mock.calls[0][1].text).toContain('Return Request');

    await notifyVendorOfPostSalesEvent({ ...baseInput, category: 'refund_denied', detail: 'Outside 7-day window' });
    expect(publishToQueueMock.mock.calls[1][1].text).toContain('Refund Request');

    await notifyVendorOfPostSalesEvent({ ...baseInput, category: 'cancel_in_progress', detail: 'Already preparing' });
    expect(publishToQueueMock.mock.calls[2][1].text).toContain('Cancellation Request');
  });

  it('notes "AI has been paused" only when aiPaused is true', async () => {
    await notifyVendorOfPostSalesEvent({ ...baseInput, aiPaused: true });
    expect(publishToQueueMock.mock.calls[0][1].text).toContain('AI has been paused');

    await notifyVendorOfPostSalesEvent({ ...baseInput, aiPaused: false });
    expect(publishToQueueMock.mock.calls[1][1].text).toContain('AI is still handling');
  });

  it('includes the order number and detail in the message and metadata', async () => {
    await notifyVendorOfPostSalesEvent(baseInput);

    const [url, payload] = publishToQueueMock.mock.calls[0];
    expect(url).toBe('https://sqs.example/response-queue');
    expect(payload).toMatchObject({
      type: 'text',
      to: '+91999999999',
      vendorId: 'vendor-1',
      phoneNumberId: 'waba-phone-1',
      metadata: { notificationType: 'complaint', conversationId: 'conv-1', traceId: 'wamid.1' }
    });
    expect(payload.text).toContain('ORD-TEST-0001');
    expect(payload.text).toContain('Item arrived damaged');
  });

  it('does not throw when the vendor has no phone on file — just skips the notify', async () => {
    vendorFindUnique.mockResolvedValue({ phone: null });

    await expect(notifyVendorOfPostSalesEvent(baseInput)).resolves.toBeUndefined();
    expect(publishToQueueMock).not.toHaveBeenCalled();
  });

  it('never throws even if the DB write fails (fire-and-forget from every call site)', async () => {
    orderAlertCreate.mockRejectedValue(new Error('db down'));

    await expect(notifyVendorOfPostSalesEvent(baseInput)).resolves.toBeUndefined();
    expect(publishToQueueMock).not.toHaveBeenCalled(); // the whole try block short-circuits on the thrown error
  });
});
