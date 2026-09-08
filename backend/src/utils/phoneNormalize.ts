const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export function normalizePhoneToE164(phone: string): string {
  const trimmed = phone.trim();
  if (PHONE_REGEX.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length >= 11 && !trimmed.startsWith('+')) {
    return `+${digits}`;
  }

  throw new Error('Phone number must be in E.164 format');
}

export function buildVendorPhoneFilters(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '');
  const noPlus = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;
  const candidates = new Set<string>([phoneNumber, noPlus, digits]);
  if (digits.length === 10) {
    candidates.add(`+91${digits}`);
    candidates.add(`91${digits}`);
  }
  return Array.from(candidates).map((value) => ({ phone: value }));
}
