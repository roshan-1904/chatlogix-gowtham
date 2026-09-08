/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VENDOR_APP_ORIGIN?: string;
  readonly VITE_SITE_ORIGIN?: string;
  readonly VITE_SUPPORT_WHATSAPP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
