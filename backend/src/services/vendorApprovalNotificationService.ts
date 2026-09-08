import { logger } from '../logger.js';

/**
 * Stub for post-approval notification (WhatsApp template or SMS).
 * Ops runbook triggers manual approval; this logs the intended message until
 * whatsappTemplateService wiring is production-ready.
 */
export async function notifyVendorApproved(input: {
  phone: string;
  businessName?: string;
  loginUrl?: string;
}): Promise<void> {
  const url = input.loginUrl ?? 'https://app.chatlogix.in/login';
  const name = input.businessName?.trim() || 'there';
  const message =
    `Your ChatLogix account is approved, ${name}. Log in at ${url} to load your wallet and connect WhatsApp.`;

  logger.info(
    {
      channel: 'approval_notification_stub',
      phone: input.phone,
      message
    },
    'vendor_approval_notification_stub'
  );
}
