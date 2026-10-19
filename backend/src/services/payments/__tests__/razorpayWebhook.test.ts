import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { signRazorpayWebhookBody } from '../../../utils/razorpaySignature.js';
import {
  FakeRazorpayApiClient,
  setRazorpayApiClientForTests
} from '../razorpayApiClient.js';
import {
  setWebhookDispatchForTests,
  type WebhookDispatchInput
} from '../razorpayWebhookDispatch.js';

const TEST_SECRET = 'whsec_test_stage2';

const findUniqueMock = vi.fn();
const transactionMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../../config/env.js', () => ({
  env: {
    RAZORPAY_WEBHOOK_SECRET: 'whsec_test_stage2',
    RAZORPAY_KEY_ID: 'rzp_test',
    RAZORPAY_KEY_SECRET: 'secret'
  }
}));

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    paymentWebhookEvent: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args)
    },
    $transaction: (fn: (tx: unknown) => Promise<void>) => transactionMock(fn)
  }
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { processRazorpayWebhook } = await import('../razorpayWebhookService.js');

function buildPayload(event: string, paymentId: string, purpose?: string) {
  return {
    entity: 'event',
    event,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: 100_00,
          currency: 'INR',
          status: 'captured',
          notes: purpose ? { purpose } : {}
        }
      }
    }
  };
}

function signedRequest(
  body: object,
  eventId: string,
  secret = TEST_SECRET
): { rawBody: Buffer; signatureHeader: string; eventIdHeader: string } {
  const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
  return {
    rawBody,
    signatureHeader: signRazorpayWebhookBody(secret, rawBody),
    eventIdHeader: eventId
  };
}

describe('razorpayWebhookService', () => {
  const fakeApi = new FakeRazorpayApiClient();
  let dispatchCalls: WebhookDispatchInput[] = [];

  beforeEach(() => {
    findUniqueMock.mockReset();
    transactionMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    dispatchCalls = [];
    setRazorpayApiClientForTests(fakeApi);
    setWebhookDispatchForTests(async (_tx, input) => {
      dispatchCalls.push(input);
      return { createPendingTransfers: false, submitRefundIds: [], submitPlatformRefundIds: [] };
    });

    fakeApi.payments.clear();
    fakeApi.payments.set('pay_test_1', {
      id: 'pay_test_1',
      amount: 100_00,
      currency: 'INR',
      status: 'captured',
      notes: { purpose: 'wallet_topup' }
    });

    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        paymentWebhookEvent: {
          create: createMock,
          update: updateMock
        }
      };
      await fn(tx);
    });

    findUniqueMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: 'row-1' });
    updateMock.mockResolvedValue({ id: 'row-1' });
  });

  afterEach(() => {
    setRazorpayApiClientForTests(null);
    setWebhookDispatchForTests(null);
  });

  it('accepts a valid signature and commits event + handler', async () => {
    const req = signedRequest(buildPayload('payment.captured', 'pay_test_1', 'wallet_topup'), 'evt_1');
    const result = await processRazorpayWebhook(req);

    expect(result).toEqual({ status: 200 });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { providerEventId: 'evt_1' },
      select: { id: true }
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { providerEventId: 'evt_1' },
      data: { processedAt: expect.any(Date) }
    });
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]?.eventType).toBe('payment.captured');
    expect(dispatchCalls[0]?.fetched.payment?.id).toBe('pay_test_1');
  });

  it('returns 400 when one signature byte is flipped', async () => {
    const req = signedRequest(buildPayload('payment.captured', 'pay_test_1', 'wallet_topup'), 'evt_bad_sig');
    const sigBytes = Buffer.from(req.signatureHeader, 'utf8');
    sigBytes[0] = sigBytes[0] === 48 ? 49 : 48;
    req.signatureHeader = sigBytes.toString('utf8');

    const result = await processRazorpayWebhook(req);
    expect(result).toEqual({ status: 400, reason: 'bad_signature' });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(dispatchCalls).toHaveLength(0);
  });

  it('does not run the handler twice for duplicate event id', async () => {
    findUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' });

    const body = buildPayload('payment.captured', 'pay_test_1', 'wallet_topup');
    const first = await processRazorpayWebhook(signedRequest(body, 'evt_dup'));
    const second = await processRazorpayWebhook(signedRequest(body, 'evt_dup'));

    expect(first).toEqual({ status: 200 });
    expect(second).toEqual({ status: 200 });
    expect(dispatchCalls).toHaveLength(1);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('rolls back the event row when the handler throws and allows retry', async () => {
    let attempt = 0;
    setWebhookDispatchForTests(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('handler boom');
      }
      return { createPendingTransfers: false, submitRefundIds: [], submitPlatformRefundIds: [] };
    });

    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        paymentWebhookEvent: {
          create: createMock,
          update: updateMock
        }
      };
      await fn(tx);
    });

    const body = buildPayload('token.confirmed', 'pay_test_1');
    const req = signedRequest({ ...body, event: 'token.confirmed', payload: {} }, 'evt_retry');

    const first = await processRazorpayWebhook(req);
    expect(first).toEqual({ status: 500 });
    expect(attempt).toBe(1);

    const second = await processRazorpayWebhook(req);
    expect(second).toEqual({ status: 200 });
    expect(attempt).toBe(2);
    expect(findUniqueMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('returns 200 on concurrent insert unique violation', async () => {
    const { Prisma } = await import('@prisma/client');
    transactionMock.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    const result = await processRazorpayWebhook(
      signedRequest(buildPayload('payment.captured', 'pay_test_1', 'wallet_topup'), 'evt_race')
    );
    expect(result).toEqual({ status: 200 });
  });
});

describe('razorpayWebhook HTTP route', () => {
  it('returns 400 for invalid signature via express raw mount', async () => {
    const express = (await import('express')).default;
    const { razorpayWebhookHandler } = await import('../../../routes/razorpayWebhook.js');

    vi.doMock('../../../config/env.js', () => ({
      env: { RAZORPAY_WEBHOOK_SECRET: TEST_SECRET }
    }));

    const app = express();
    app.post(
      '/api/payments/razorpay/webhook',
      express.raw({ type: 'application/json' }),
      razorpayWebhookHandler
    );

    const rawBody = Buffer.from(JSON.stringify(buildPayload('payment.captured', 'pay_x')), 'utf8');
    const badSig = crypto.createHmac('sha256', 'wrong').update(rawBody).digest('hex');

    const server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    const port = (server.address() as import('node:net').AddressInfo).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/payments/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': badSig,
        'X-Razorpay-Event-Id': 'evt_http'
      },
      body: rawBody
    });

    expect(res.status).toBe(400);
    server.close();
  });
});
