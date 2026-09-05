import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'chatlogix_refresh';

function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/i.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return value * multipliers[unit];
}

function isSecureCookie(): boolean {
  if (env.AUTH_COOKIE_SECURE === 'true') return true;
  if (env.AUTH_COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production';
}

export function getRefreshCookieMaxAgeMs(): number {
  return parseDurationToMs(env.AUTH_REFRESH_TOKEN_EXPIRES_IN || '7d');
}

export function buildRefreshCookieOptions(): CookieOptions {
  const secure = isSecureCookie();
  return {
    httpOnly: true,
    path: '/api/auth',
    sameSite: secure ? 'none' : 'lax',
    secure,
    maxAge: getRefreshCookieMaxAgeMs()
  };
}

export function setRefreshCookie(res: Response, rawToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, buildRefreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  const { maxAge: _maxAge, ...options } = buildRefreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, options);
}
