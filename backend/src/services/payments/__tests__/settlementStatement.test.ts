import { describe, expect, it } from 'vitest';
import {
  buildMonthlyStatement,
  istCalendarMonthUtcRange,
  sumLedgerEntries,
  type LedgerEntrySlice,
  type PaymentSlice,
  type TransferSlice
} from '../settlementStatementMath.js';

const OCT_2026 = istCalendarMonthUtcRange(2026, 10);

function entry(
  partial: Omit<LedgerEntrySlice, 'amountMilli' | 'balanceAfterMilli' | 'direction'> & {
    amountMilli: bigint;
    balanceAfterMilli: bigint;
    direction?: string;
  }
): LedgerEntrySlice {
  return {
    direction: partial.direction ?? 'credit',
    ...partial
  };
}

describe('settlementStatementMath', () => {
  it('IST month bounds cover October 2026', () => {
    expect(OCT_2026.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(OCT_2026.endExclusive.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });

  it('fixture month balances: opening + movements = closing and matches ledger sum', () => {
    const payCaptured = new Date('2026-10-05T10:00:00.000Z');
    const releaseAt = new Date('2026-10-12T08:00:00.000Z');
    const fundingAt = new Date('2026-10-15T12:00:00.000Z');

    const payments: PaymentSlice[] = [
      {
        amountPaise: 100_000,
        gatewayFeePaise: 200,
        gatewayTaxPaise: 36,
        platformFeePaise: 1000,
        platformFeeGstPaise: 153,
        gstTcsPaise: 50,
        tdsPaise: 10,
        netMilli: 987_040n,
        capturedAt: payCaptured,
        settlementAlert: null
      }
    ];

    const transfers: TransferSlice[] = [
      {
        kind: 'main',
        amountPaise: 90_000,
        reversedPaise: 0,
        createdAt: payCaptured
      },
      {
        kind: 'reserve',
        amountPaise: 8_704,
        reversedPaise: 0,
        createdAt: payCaptured
      }
    ];

    const entries: LedgerEntrySlice[] = [
      entry({
        kind: 'payment_credit',
        amountMilli: 987_040n,
        balanceAfterMilli: 987_040n,
        createdAt: payCaptured
      }),
      entry({
        kind: 'transfer_release',
        direction: 'debit',
        amountMilli: 500_000n,
        balanceAfterMilli: 487_040n,
        createdAt: releaseAt
      }),
      entry({
        kind: 'shop_funding',
        amountMilli: 20_000n,
        balanceAfterMilli: 507_040n,
        createdAt: fundingAt
      })
    ];

    const statement = buildMonthlyStatement({
      entries,
      payments,
      transfers,
      start: OCT_2026.start,
      endExclusive: OCT_2026.endExclusive
    });

    expect(statement.openingBalanceMilli).toBe(0n);
    expect(statement.closingBalanceMilli).toBe(507_040n);
    expect(statement.ledgerNetChangeMilli).toBe(507_040n);
    expect(statement.balances).toBe(true);
    expect(statement.ledgerMatchesClosing).toBe(true);

    expect(statement.movements.grossCollectedPaise).toBe(100_000);
    expect(statement.movements.gatewayFeePaise).toBe(200);
    expect(statement.movements.platformFeePaise).toBe(1000);
    expect(statement.movements.platformFeeGstPaise).toBe(153);
    expect(statement.movements.gstTcsPaise).toBe(50);
    expect(statement.movements.tdsPaise).toBe(10);
    expect(statement.movements.netCollectedMilli).toBe(987_040n);
    expect(statement.movements.reservePaise).toBe(8_704);
    expect(statement.movements.releasesMilli).toBe(500_000n);
    expect(statement.movements.fundingMilli).toBe(20_000n);

    expect(sumLedgerEntries(entries)).toBe(507_040n);
  });

  it('carries opening balance from prior month activity', () => {
    const prior = new Date('2026-09-20T12:00:00.000Z');
    const inMonth = new Date('2026-10-02T12:00:00.000Z');
    const entries: LedgerEntrySlice[] = [
      entry({
        kind: 'payment_credit',
        amountMilli: 100_000n,
        balanceAfterMilli: 100_000n,
        createdAt: prior
      }),
      entry({
        kind: 'transfer_release',
        direction: 'debit',
        amountMilli: 30_000n,
        balanceAfterMilli: 70_000n,
        createdAt: inMonth
      })
    ];
    const statement = buildMonthlyStatement({
      entries,
      payments: [],
      transfers: [],
      start: OCT_2026.start,
      endExclusive: OCT_2026.endExclusive
    });
    expect(statement.openingBalanceMilli).toBe(100_000n);
    expect(statement.closingBalanceMilli).toBe(70_000n);
    expect(statement.balances).toBe(true);
    expect(statement.ledgerMatchesClosing).toBe(true);
  });

  it('includes signed adjustments in the movement total', () => {
    const at = new Date('2026-10-08T09:00:00.000Z');
    const entries: LedgerEntrySlice[] = [
      entry({
        kind: 'payment_credit',
        amountMilli: 100_000n,
        balanceAfterMilli: 100_000n,
        createdAt: at
      }),
      entry({
        kind: 'adjustment',
        direction: 'debit',
        amountMilli: 5_000n,
        balanceAfterMilli: 95_000n,
        createdAt: new Date('2026-10-09T09:00:00.000Z')
      })
    ];
    const statement = buildMonthlyStatement({
      entries,
      payments: [],
      transfers: [],
      start: OCT_2026.start,
      endExclusive: OCT_2026.endExclusive
    });
    expect(statement.movements.adjustmentsMilli).toBe(-5_000n);
    expect(statement.balances).toBe(true);
  });
});
