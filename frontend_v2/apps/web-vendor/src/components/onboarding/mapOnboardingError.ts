export function mapOnboardingError(error: unknown): string {
  if (!navigator.onLine) {
    return "You're offline. Check your internet and try again.";
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('already has an account') || lower.includes('phone_already_registered')) {
    return 'This number already has an account. Please log in instead.';
  }
  if (lower.includes('email') && lower.includes('already')) {
    return 'That email is already used by another shop. Try a different email.';
  }
  if (lower.includes('otp') || lower.includes('code') || lower.includes('invalid')) {
    return "That code didn't match. Check the SMS and try again.";
  }
  if (
    lower.includes('too many') ||
    lower.includes('rate_limit') ||
    lower.includes('quota_exceeded')
  ) {
    return 'You already read a brochure this hour. Wait about an hour, or add items by hand.';
  }
  if (lower.includes('could not read') || lower.includes('extract')) {
    return 'We could not read that menu. Try a clearer photo, or add items by hand.';
  }
  if (lower.includes('trial') && lower.includes('expired')) {
    return 'Your trial has expired. You can still finish setup or add funds from your wallet later.';
  }
  if (lower.includes('insufficient') || lower.includes('balance')) {
    return 'Your trial balance is used up. You can still finish setup — top up from your wallet when you need more demo replies.';
  }

  return 'Something went wrong. Please try again. If this keeps happening, contact us using the link below.';
}
