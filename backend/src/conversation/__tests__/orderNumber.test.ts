import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  formatVendorPrefix,
  isOrderNumberConflict,
  nextOrderNumber,
  orderNumberStem
} from '../cart/orderNumber.js';

function p2002(target?: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`orderNumber`)', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: target === undefined ? undefined : { target }
  });
}

describe('orderNumber helpers', () => {
  it('pads a short vendor prefix to 5 chars the same way dashboard order numbers do', () => {
    expect(formatVendorPrefix('TEST')).toBe('TESTX');
    expect(formatVendorPrefix(null)).toBe('ORDER');
    expect(formatVendorPrefix('VENDORI')).toBe('VENDO');
  });

  it('builds ORD-{prefix}-YYYYMM from a fixed date', () => {
    expect(orderNumberStem('TESTX', new Date('2026-09-21T14:17:07.000Z'))).toBe('ORD-TESTX-202609');
  });

  it('takes max+1 from the global stem, not a per-vendor count of 0', () => {
    expect(nextOrderNumber('ORD-ORDER-202609', null)).toBe('ORD-ORDER-2026090001');
    expect(nextOrderNumber('ORD-ORDER-202609', 'ORD-ORDER-2026090007')).toBe('ORD-ORDER-2026090008');
    expect(nextOrderNumber('ORD-ORDER-202609', 'ORD-OTHER-2026090099')).toBe('ORD-ORDER-2026090001');
  });

  it('treats P2002 on orderNumber as a retryable conflict, including when Prisma omits meta.target', () => {
    expect(isOrderNumberConflict(p2002(['orderNumber']))).toBe(true);
    expect(isOrderNumberConflict(p2002('orderNumber'))).toBe(true);
    expect(isOrderNumberConflict(p2002())).toBe(true);
    expect(isOrderNumberConflict(p2002(['whatsappMessageId']))).toBe(false);
    expect(isOrderNumberConflict(new Error('connection reset'))).toBe(false);
  });
});
