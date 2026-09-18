import { metaConnectEnv } from '../../config/env.js';
import { logger } from '../../logger.js';

export type GraphFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; body: string; graphCode?: number; graphMessage?: string };

export async function graphFetch<T = unknown>(
  path: string,
  options: {
    method?: string;
    accessToken: string;
    body?: Record<string, unknown>;
    searchParams?: Record<string, string>;
  }
): Promise<GraphFetchResult<T>> {
  const base = metaConnectEnv.graphBaseUrl.replace(/\/$/, '');
  const url = new URL(`${base}/${path.replace(/^\//, '')}`);
  if (options.searchParams) {
    for (const [k, v] of Object.entries(options.searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await res.text();
  if (!res.ok) {
    let graphCode: number | undefined;
    let graphMessage: string | undefined;
    try {
      const parsed = JSON.parse(text) as { error?: { code?: number; message?: string } };
      graphCode = parsed.error?.code;
      graphMessage = parsed.error?.message;
    } catch {
      // keep raw body
    }
    logger.warn(
      { status: res.status, path, graphCode, graphMessage, bodyPreview: text.slice(0, 500) },
      'Graph API request failed'
    );
    return { ok: false, status: res.status, body: text, graphCode, graphMessage };
  }

  try {
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  } catch {
    return { ok: true, data: {} as T };
  }
}

export async function exchangeEmbeddedSignupCode(code: string): Promise<
  GraphFetchResult<{ access_token: string; expires_in?: number }>
> {
  if (!metaConnectEnv.appId || !metaConnectEnv.appSecret) {
    return {
      ok: false,
      status: 500,
      body: 'META_APP_ID or META_APP_SECRET not configured',
      graphMessage: 'meta_app_not_configured'
    };
  }
  const base = metaConnectEnv.graphBaseUrl.replace(/\/$/, '');
  const url = new URL(`${base}/oauth/access_token`);
  url.searchParams.set('client_id', metaConnectEnv.appId);
  url.searchParams.set('client_secret', metaConnectEnv.appSecret);
  url.searchParams.set('code', code);

  const res = await fetch(url.toString(), { method: 'GET' });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: text };
  }
  try {
    return { ok: true, data: JSON.parse(text) as { access_token: string; expires_in?: number } };
  } catch {
    return { ok: false, status: 500, body: text };
  }
}

export async function fetchPhoneNumberProfile(
  phoneNumberId: string,
  businessToken: string
): Promise<
  GraphFetchResult<{ display_phone_number?: string; verified_name?: string }>
> {
  return graphFetch(`${phoneNumberId}`, {
    accessToken: businessToken,
    searchParams: { fields: 'display_phone_number,verified_name' }
  });
}

export async function registerCloudPhoneNumber(
  phoneNumberId: string,
  businessToken: string
): Promise<GraphFetchResult<{ success?: boolean }>> {
  return graphFetch(`${phoneNumberId}/register`, {
    method: 'POST',
    accessToken: businessToken,
    body: {
      messaging_product: 'whatsapp',
      pin: '123456'
    }
  });
}

export async function subscribeAppToWaba(
  wabaId: string,
  businessToken: string
): Promise<GraphFetchResult<{ success?: boolean }>> {
  return graphFetch(`${wabaId}/subscribed_apps`, {
    method: 'POST',
    accessToken: businessToken
  });
}

export async function attachExtendedCreditLine(wabaId: string): Promise<GraphFetchResult<unknown>> {
  const creditLineId = metaConnectEnv.extendedCreditLineId;
  const systemToken = metaConnectEnv.systemUserToken;
  if (!creditLineId || !systemToken) {
    return {
      ok: false,
      status: 503,
      body: 'Credit line or system user token not configured',
      graphMessage: 'credit_attach_not_configured'
    };
  }
  return graphFetch(`${creditLineId}/whatsapp_credit_sharing_and_attach`, {
    method: 'POST',
    accessToken: systemToken,
    searchParams: {
      waba_currency: 'INR',
      waba_id: wabaId
    }
  });
}

export async function fetchWabaPrimaryFundingId(
  wabaId: string,
  systemToken: string
): Promise<GraphFetchResult<{ primary_funding_id?: string }>> {
  return graphFetch(`${wabaId}`, {
    accessToken: systemToken,
    searchParams: { fields: 'primary_funding_id' }
  });
}
