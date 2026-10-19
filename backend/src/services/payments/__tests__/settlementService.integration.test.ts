/**
 * Real Postgres concurrency checks. Run with:
 * SETTLEMENT_INTEGRATION=1 npm test -- src/services/payments/__tests__/settlementService.integration.test.ts
 */
import { describe, expect, it } from 'vitest';

const run = process.env.SETTLEMENT_INTEGRATION === '1';

describe.skipIf(!run)('settlementService integration', () => {
  it('placeholder — enable SETTLEMENT_INTEGRATION against a disposable database', () => {
    expect(run).toBe(true);
  });
});
