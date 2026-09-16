import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

// FX_REFRESH_ENABLED only gates the boot/interval loop in index.ts. An admin
// clicking "Refresh rate" must still reach Frankfurter with the flag off.
process.env.FX_REFRESH_ENABLED = 'false';

const refreshUsdInrRate = vi.fn();
const ensurePlatformSettings = vi.fn();
const getPlatformSettings = vi.fn();
const updatePlatformSettings = vi.fn();

vi.mock('../../services/platformSettingsService.js', () => ({
  refreshUsdInrRate: (...args: unknown[]) => refreshUsdInrRate(...args),
  ensurePlatformSettings: (...args: unknown[]) => ensurePlatformSettings(...args),
  getPlatformSettings: (...args: unknown[]) => getPlatformSettings(...args),
  updatePlatformSettings: (...args: unknown[]) => updatePlatformSettings(...args),
  FX_SANITY_MIN: 50,
  FX_SANITY_MAX: 150
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  StepLogger: class {},
  createOperationId: () => 'op-1'
}));

const { isFxRefreshLoopEnabled } = await import('../../config/env.js');
const { adminSettingsRouter } = await import('../adminSettings.js');

const app = express();
app.use(express.json());
app.use('/admin/settings', adminSettingsRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/settings`;

afterAll(() => {
  server.close();
});

describe('POST /api/admin/settings/refresh-fx is not gated by FX_REFRESH_ENABLED', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the loop flag to off for this process', () => {
    expect(isFxRefreshLoopEnabled).toBe(false);
  });

  it('still fetches and returns the new rate', async () => {
    refreshUsdInrRate.mockResolvedValue({ ok: true, rate: 84.1, settings: { usdToInrRate: 84.1 } });

    const res = await fetch(`${baseUrl}/refresh-fx`, { method: 'POST' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, rate: 84.1 });
    expect(refreshUsdInrRate).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed fetch as 502 rather than skipping the call', async () => {
    refreshUsdInrRate.mockResolvedValue({
      ok: false,
      reason: 'fetch_failed',
      settings: { usdToInrRate: 83 }
    });

    const res = await fetch(`${baseUrl}/refresh-fx`, { method: 'POST' });

    expect(res.status).toBe(502);
    expect(refreshUsdInrRate).toHaveBeenCalledTimes(1);
  });
});
