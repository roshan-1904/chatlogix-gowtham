import { describe, expect, it } from 'vitest';
import { buildNeedsAttentionItems } from '../buildNeedsAttentionItems';

describe('buildNeedsAttentionItems', () => {
  it('returns empty list when nothing needs attention', () => {
    expect(
      buildNeedsAttentionItems({
        pendingOrders: 0,
        whatsappLive: true,
        lowBalanceWarning: false,
        aiPaused: 0,
      })
    ).toEqual([]);
  });

  it('includes pending orders link', () => {
    const items = buildNeedsAttentionItems({
      pendingOrders: 3,
      whatsappLive: true,
      lowBalanceWarning: false,
      aiPaused: 0,
    });
    expect(items).toHaveLength(1);
    expect(items[0].href).toBe('/orders?status=pending');
    expect(items[0].title).toContain('3 pending');
  });

  it('includes WhatsApp connect when not live', () => {
    const items = buildNeedsAttentionItems({
      pendingOrders: 0,
      whatsappLive: false,
      lowBalanceWarning: false,
      aiPaused: 0,
    });
    expect(items.some((i) => i.id === 'whatsapp-connect')).toBe(true);
  });

  it('includes low wallet warning', () => {
    const items = buildNeedsAttentionItems({
      pendingOrders: 0,
      whatsappLive: true,
      lowBalanceWarning: true,
      aiPaused: 0,
    });
    expect(items[0].id).toBe('low-wallet');
    expect(items[0].href).toBe('/wallet');
  });

  it('includes ai paused conversations', () => {
    const items = buildNeedsAttentionItems({
      pendingOrders: 0,
      whatsappLive: true,
      lowBalanceWarning: false,
      aiPaused: 2,
    });
    expect(items[0].title).toContain('2 conversations');
  });

  it('caps at five items and sorts by priority', () => {
    const items = buildNeedsAttentionItems({
      pendingOrders: 1,
      whatsappLive: false,
      lowBalanceWarning: true,
      aiPaused: 1,
    });
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items[0].id).toBe('pending-orders');
    expect(items[1].id).toBe('whatsapp-connect');
  });
});
