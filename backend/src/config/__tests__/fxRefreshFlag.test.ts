import { describe, it, expect } from 'vitest';
import { resolveFxRefreshEnabled } from '../env.js';

// The boot-time tick of startFxRateRefreshLoop() writes PlatformSettings and an
// FxRateHistory row. Local dev points DATABASE_URL at the shared database, so
// the loop must stay off unless someone asks for it.
describe('resolveFxRefreshEnabled', () => {
  it('stays off outside production when the flag is unset', () => {
    expect(resolveFxRefreshEnabled(undefined, 'development')).toBe(false);
    expect(resolveFxRefreshEnabled(undefined, 'test')).toBe(false);
  });

  it('runs in production when the flag is unset', () => {
    expect(resolveFxRefreshEnabled(undefined, 'production')).toBe(true);
  });

  it('is forced on by FX_REFRESH_ENABLED=true (staging box)', () => {
    expect(resolveFxRefreshEnabled('true', 'development')).toBe(true);
    expect(resolveFxRefreshEnabled('true', 'test')).toBe(true);
    expect(resolveFxRefreshEnabled('true', 'production')).toBe(true);
  });

  it('is forced off by FX_REFRESH_ENABLED=false, production included', () => {
    expect(resolveFxRefreshEnabled('false', 'development')).toBe(false);
    expect(resolveFxRefreshEnabled('false', 'production')).toBe(false);
  });

  it('falls back to NODE_ENV for any other value', () => {
    expect(resolveFxRefreshEnabled('', 'production')).toBe(true);
    expect(resolveFxRefreshEnabled('1', 'development')).toBe(false);
    expect(resolveFxRefreshEnabled('yes', 'development')).toBe(false);
  });

  it('derives isFxRefreshLoopEnabled from the running process env', async () => {
    const { env, isFxRefreshLoopEnabled } = await import('../env.js');
    expect(isFxRefreshLoopEnabled).toBe(
      resolveFxRefreshEnabled(env.FX_REFRESH_ENABLED, env.NODE_ENV)
    );
  });
});
