export const WHATSAPP_CONNECT_STATUSES = [
  'not_started',
  'meta_in_progress',
  'credit_attached',
  'live',
  'disconnected',
  'error'
] as const;

export type WhatsAppConnectStatus = (typeof WHATSAPP_CONNECT_STATUSES)[number];

export const WHATSAPP_CONNECT_PATHS = ['cloud', 'coexistence'] as const;

export type WhatsAppConnectPath = (typeof WHATSAPP_CONNECT_PATHS)[number];

export const ACTIVE_CONNECT_STATUSES: WhatsAppConnectStatus[] = [
  'meta_in_progress',
  'credit_attached',
  'live'
];

export function isActiveConnectStatus(status: string | null | undefined): boolean {
  return !!status && (ACTIVE_CONNECT_STATUSES as readonly string[]).includes(status);
}
