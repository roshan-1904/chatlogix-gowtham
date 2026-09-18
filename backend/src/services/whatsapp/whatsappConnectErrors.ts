const VENDOR_ERROR_MESSAGES: Record<string, string> = {
  phone_number_taken:
    'This WhatsApp number is already connected to another shop.',
  vendor_not_approved: 'Finish setting up your shop before connecting WhatsApp.',
  meta_app_not_configured: 'WhatsApp connect is not configured yet. Try again later.',
  graph_timeout: 'WhatsApp is taking too long. Nothing was lost — tap retry.',
  graph_error: 'Something went wrong connecting to WhatsApp. Try again.',
  credit_attach_failed:
    'Your number is saved but billing isn’t linked yet.',
  display_name_rejected: 'WhatsApp didn’t accept that profile name.',
  number_on_other_bsp:
    'This number is still connected to another WhatsApp provider.',
  otp_failed: 'We couldn’t verify that number.',
  facebook_cancelled: 'Connection wasn’t finished.'
};

export function vendorMessageForCode(code: string, fallback?: string): string {
  return VENDOR_ERROR_MESSAGES[code] ?? fallback ?? VENDOR_ERROR_MESSAGES.graph_error;
}

export function mapGraphFailure(params: {
  status: number;
  graphCode?: number;
  graphMessage?: string;
}): { code: string; message: string } {
  const msg = (params.graphMessage ?? '').toLowerCase();
  if (params.status >= 500) {
    return { code: 'graph_timeout', message: vendorMessageForCode('graph_timeout') };
  }
  if (msg.includes('display name') || params.graphCode === 131009) {
    return { code: 'display_name_rejected', message: vendorMessageForCode('display_name_rejected') };
  }
  if (msg.includes('already') && msg.includes('registered')) {
    return { code: 'number_on_other_bsp', message: vendorMessageForCode('number_on_other_bsp') };
  }
  if (msg.includes('otp') || msg.includes('verification')) {
    return { code: 'otp_failed', message: vendorMessageForCode('otp_failed') };
  }
  return { code: 'graph_error', message: vendorMessageForCode('graph_error') };
}

export function buildWaMeLink(displayPhone: string | null | undefined): string | null {
  if (!displayPhone) return null;
  const digits = displayPhone.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
