import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const JWT_SECRET = env.AUTH_JWT_SECRET;
const TOKEN_TTL = '30d';

export interface UpiPayTokenPayload {
  orderId: string;
  typ: 'upi_pay';
}

export function createUpiPayLinkToken(orderId: string): string {
  return jwt.sign({ orderId, typ: 'upi_pay' } satisfies UpiPayTokenPayload, JWT_SECRET, {
    expiresIn: TOKEN_TTL
  });
}

export function verifyUpiPayLinkToken(token: string): UpiPayTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as UpiPayTokenPayload;
  if (decoded.typ !== 'upi_pay' || !decoded.orderId) {
    throw new Error('Invalid pay link');
  }
  return decoded;
}

export function getPublicPayBaseUrl(): string {
  const configured = env.PUBLIC_PAY_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const port = env.PORT || '8000';
  return `http://localhost:${port}`;
}

export function buildTapToPayPageUrl(token: string): string {
  return `${getPublicPayBaseUrl()}/pay/u/${encodeURIComponent(token)}`;
}
