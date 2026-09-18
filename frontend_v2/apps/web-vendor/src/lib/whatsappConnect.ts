import { apiClient } from './api';

export type WhatsAppConnectPath = 'cloud' | 'coexistence';

export type WhatsAppConnectStatus =
  | 'not_started'
  | 'meta_in_progress'
  | 'credit_attached'
  | 'live'
  | 'disconnected'
  | 'error';

export interface WhatsAppStatus {
  connectStatus: WhatsAppConnectStatus | null;
  connectPath: WhatsAppConnectPath | null;
  phoneNumberId: string | null;
  displayPhone: string | null;
  displayName: string | null;
  waMeLink: string | null;
  mockAttachSkipped: boolean;
  testInboundAt: string | null;
  walletCanReply: boolean;
  walletBlockReason: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  connectedAt: string | null;
  liveAt: string | null;
}

export interface WhatsAppEmbeddedConfig {
  appId: string | null;
  configId: string | null;
  configured: boolean;
}

export interface CompleteConnectPayload {
  code: string;
  waba_id: string;
  phone_number_id: string;
  business_id?: string;
  connectPath: WhatsAppConnectPath;
}

export function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  return apiClient.get<WhatsAppStatus>('/vendors/me/whatsapp');
}

export function getWhatsAppEmbeddedConfig(): Promise<WhatsAppEmbeddedConfig> {
  return apiClient.get<WhatsAppEmbeddedConfig>('/vendors/me/whatsapp/config');
}

export function completeWhatsAppConnect(body: CompleteConnectPayload): Promise<WhatsAppStatus> {
  return apiClient.post<WhatsAppStatus>('/vendors/me/whatsapp/complete-connect', body);
}

export function retryWhatsAppCreditAttach(): Promise<WhatsAppStatus> {
  return apiClient.post<WhatsAppStatus>('/vendors/me/whatsapp/retry-attach', {});
}

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string }; status?: string }) => void,
        options: Record<string, unknown>
      ) => void;
    };
  }
}

export function loadFacebookSdk(appId: string): Promise<void> {
  if (window.FB) {
    window.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('facebook-jssdk');
    if (existing) {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
        resolve();
      };
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
      resolve();
    };
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => reject(new Error('Could not load Facebook SDK'));
    document.body.appendChild(script);
  });
}

export type EmbeddedSignupSession = {
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
};

interface EmbeddedSignupMessage {
  type?: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
  };
}

export function listenEmbeddedSignupSession(
  onSession: (session: EmbeddedSignupSession) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
      return;
    }
    try {
      const raw: unknown =
        typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      const payload = raw as EmbeddedSignupMessage | null;
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;
      onSession({
        wabaId: payload.data?.waba_id,
        phoneNumberId: payload.data?.phone_number_id,
        businessId: payload.data?.business_id
      });
    } catch {
      // ignore non-JSON postMessages
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export function launchEmbeddedSignup(configId: string): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK not loaded'));
      return;
    }
    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          resolve({ code: response.authResponse.code });
          return;
        }
        reject(new Error('Connection wasn’t finished.'));
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 3
        }
      }
    );
  });
}
