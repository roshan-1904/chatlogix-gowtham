import { describe, it, expect } from 'vitest';
import {
  citesOrderNumberFromHistory,
  isOrderStatusTurn,
  looksLikeDeferral,
  renderOrderStatusReply,
  shouldRewriteOrderStatusReply,
  stripKnowledgeGapOps,
  stripSendProductMediaOps
} from '../orderStatusGuard.js';
import type { OrderHistoryEntry } from '../types.js';

const pendingTin: OrderHistoryEntry = {
  id: 'order-1',
  orderNumber: 'ORD-IBELL-0042',
  items: [
    {
      productId: 'prod-tin',
      name: 'Premium Baking Tin',
      quantity: 1,
      unit: 'pc',
      unitPricePaise: 129900,
      lineTotalPaise: 129900,
      variantLabel: null
    }
  ],
  totalAmount: 129900,
  status: 'pending',
  createdAt: new Date('2026-09-02T07:48:07.000Z'),
  estimatedDelivery: null,
  confirmedAt: null,
  preparedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  cancellationReason: null
};

describe('isOrderStatusTurn', () => {
  it('matches English status / where-is-it / last-order / already-ordered / tracking', () => {
    expect(
      isOrderStatusTurn({
        mergedContent: 'what is my order status?',
        intent: 'query',
        ops: [{ type: 'noop' }],
        orderHistory: [pendingTin]
      })
    ).toBe(true);
    expect(
      isOrderStatusTurn({
        mergedContent: "where's my order",
        intent: 'query',
        ops: [{ type: 'noop' }],
        orderHistory: []
      })
    ).toBe(true);
    expect(
      isOrderStatusTurn({
        mergedContent: 'I already ordered. Last order please.',
        intent: 'query',
        ops: [{ type: 'noop' }],
        orderHistory: [pendingTin]
      })
    ).toBe(true);
    expect(
      isOrderStatusTurn({
        mergedContent: 'tracking number?',
        intent: 'query',
        ops: [{ type: 'noop' }],
        orderHistory: [pendingTin]
      })
    ).toBe(true);
  });

  it('matches Tamil/Tanglish eappo kidaikum and order pannen', () => {
    expect(
      isOrderStatusTurn({
        mergedContent: 'Na order pannen. Eappo kidaikum?',
        intent: 'query',
        ops: [{ type: 'noop' }],
        orderHistory: [pendingTin]
      })
    ).toBe(true);
  });

  it('matches cancel/refund ops even without status language', () => {
    expect(
      isOrderStatusTurn({
        mergedContent: 'please do it',
        intent: 'other',
        ops: [{ type: 'cancel', orderNumber: 'ORD-IBELL-0042' }],
        orderHistory: [pendingTin]
      })
    ).toBe(true);
    expect(
      isOrderStatusTurn({
        mergedContent: 'money back',
        intent: 'other',
        ops: [{ type: 'refund_request', orderNumber: 'ORD-IBELL-0042', reason: null }],
        orderHistory: [pendingTin]
      })
    ).toBe(true);
  });

  it('does not treat "how long if I order today" with empty history as order-status', () => {
    expect(
      isOrderStatusTurn({
        mergedContent: 'How long if I order today?',
        intent: 'query',
        ops: [{ type: 'noop' }],
        orderHistory: []
      })
    ).toBe(false);
  });

  it('does not match a normal catalog question', () => {
    expect(
      isOrderStatusTurn({
        mergedContent: 'Do you have baking tins?',
        intent: 'query',
        ops: [{ type: 'noop' }],
        orderHistory: [pendingTin]
      })
    ).toBe(false);
  });
});

describe('looksLikeDeferral', () => {
  it('detects check / get back / still checking / Kanmani will confirm', () => {
    expect(looksLikeDeferral('I will check the current status and get back to you')).toBe(true);
    expect(looksLikeDeferral("I'm still checking your order status.")).toBe(true);
    expect(looksLikeDeferral('Kanmani will confirm availability')).toBe(true);
    expect(looksLikeDeferral("I'll check with the team and get back to you shortly.")).toBe(true);
    expect(looksLikeDeferral('Your order ORD-IBELL-0042 is pending.')).toBe(false);
  });
});

describe('renderOrderStatusReply', () => {
  it('cites order number, status label, and English item names when history is present', () => {
    const text = renderOrderStatusReply([pendingTin], { orderPreparationConfig: { type: 'after_order' } });
    expect(text).toContain('ORD-IBELL-0042');
    expect(text).toContain('⏳ Order Received');
    expect(text).toContain('Premium Baking Tin');
    expect(text).not.toMatch(/get back/i);
  });

  it('says no order on file when history is empty', () => {
    expect(renderOrderStatusReply([], null)).toMatch(/don'?t see an order on file/i);
  });
});

describe('shouldRewriteOrderStatusReply', () => {
  it('rewrites deferrals and drafts that omit the order number', () => {
    expect(shouldRewriteOrderStatusReply('I will check and get back to you', [pendingTin])).toBe(true);
    expect(shouldRewriteOrderStatusReply('Your order is being prepared.', [pendingTin])).toBe(true);
    expect(
      shouldRewriteOrderStatusReply('Your order ORD-IBELL-0042 is pending — Premium Baking Tin x1.', [pendingTin])
    ).toBe(false);
  });

  it('always rewrites when history is empty (nothing to cite)', () => {
    expect(shouldRewriteOrderStatusReply('No problem, I can help.', [])).toBe(true);
  });
});

describe('stripSendProductMediaOps', () => {
  it('drops send_product_media and leaves other ops', () => {
    const ops = [
      { type: 'noop' as const },
      { type: 'send_product_media' as const, productId: 'p1', kind: 'image' as const }
    ];
    expect(stripSendProductMediaOps(ops)).toEqual([{ type: 'noop' }]);
  });
});

describe('stripKnowledgeGapOps', () => {
  it('drops knowledge_gap and leaves other ops', () => {
    const ops = [
      { type: 'noop' as const },
      { type: 'knowledge_gap' as const, question: 'sizes?' }
    ];
    expect(stripKnowledgeGapOps(ops)).toEqual([{ type: 'noop' }]);
  });
});

describe('citesOrderNumberFromHistory', () => {
  it('is case-insensitive', () => {
    expect(citesOrderNumberFromHistory('see ord-ibell-0042 above', [pendingTin])).toBe(true);
    expect(citesOrderNumberFromHistory('no number here', [pendingTin])).toBe(false);
  });
});
