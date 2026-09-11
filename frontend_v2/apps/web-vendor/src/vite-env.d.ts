/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  readonly VITE_ENVIRONMENT?: string;
  /** Support WhatsApp number, digits only (e.g. 919876543210). */
  readonly VITE_SUPPORT_WHATSAPP?: string;
  /** Fallback support inbox used when VITE_SUPPORT_WHATSAPP is unset. */
  readonly VITE_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

