/**
 * Vendor Support Contact resolution helper.
 *
 * Resolves support contact in priority order:
 * 1. VITE_SUPPORT_WHATSAPP (digits only, e.g. 919876543210 -> https://wa.me/919876543210)
 * 2. VITE_SUPPORT_EMAIL (mailto link)
 * 3. Fallback: https://www.chatlogix.in/contact
 */

export interface SupportContact {
  type: 'whatsapp' | 'email' | 'fallback';
  href: string;
  label: string;
  value: string;
}

export interface SupportChannels {
  whatsapp: { href: string; label: string; phone: string } | null;
  email: { href: string; label: string; email: string } | null;
  fallback: { href: string; label: string; url: string };
}

export function resolveSupportContact(env?: {
  whatsapp?: string;
  email?: string;
}): SupportContact {
  const rawWhatsApp =
    env && 'whatsapp' in env ? env.whatsapp ?? '' : (import.meta.env?.VITE_SUPPORT_WHATSAPP as string ?? '');
  const digits = rawWhatsApp.replace(/\D/g, '');
  if (digits) {
    return {
      type: 'whatsapp',
      href: `https://wa.me/${digits}`,
      label: 'WhatsApp us',
      value: `+${digits}`,
    };
  }

  const rawEmail =
    env && 'email' in env ? env.email ?? '' : (import.meta.env?.VITE_SUPPORT_EMAIL as string ?? '');
  const email = rawEmail.trim();
  if (email) {
    return {
      type: 'email',
      href: `mailto:${email}`,
      label: 'Email us',
      value: email,
    };
  }

  return {
    type: 'fallback',
    href: 'https://www.chatlogix.in/contact',
    label: 'Contact us',
    value: 'https://www.chatlogix.in',
  };
}

export function getAllSupportChannels(env?: {
  whatsapp?: string;
  email?: string;
}): SupportChannels {
  const rawWhatsApp =
    env && 'whatsapp' in env ? env.whatsapp ?? '' : (import.meta.env?.VITE_SUPPORT_WHATSAPP as string ?? '');
  const digits = rawWhatsApp.replace(/\D/g, '');

  const rawEmail =
    env && 'email' in env ? env.email ?? '' : (import.meta.env?.VITE_SUPPORT_EMAIL as string ?? '');
  const email = rawEmail.trim();

  return {
    whatsapp: digits
      ? {
          href: `https://wa.me/${digits}`,
          label: 'Chat on WhatsApp',
          phone: `+${digits}`,
        }
      : null,
    email: email
      ? {
          href: `mailto:${email}`,
          label: 'Send Email',
          email,
        }
      : null,
    fallback: {
      href: 'https://www.chatlogix.in/contact',
      label: 'Help Center',
      url: 'https://www.chatlogix.in/contact',
    },
  };
}

export function formatDiagnosticsString(vendor?: {
  id?: string;
  businessName?: string;
  plan?: string;
}): string {
  const lines = [
    `Shop: ${vendor?.businessName || 'Unknown Shop'}`,
    `Vendor ID: ${vendor?.id || '—'}`,
    `Plan: ${vendor?.plan || 'Active'}`,
    `App Version: 0.1.0`,
  ];
  return lines.join('\n');
}

