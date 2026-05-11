import { prisma } from '../db/prisma.js';
import { UserRole } from './tokenService.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';
import { CustomError, ErrorType, ErrorSeverity } from '../middleware/errorHandler.js';

const adminPhoneSet = new Set(
  (env.AUTH_ADMIN_PHONES || '')
    .split(',')
    .map(phone => phone.trim())
    .filter(Boolean)
    .map(normalizeDigits)
);

function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

function buildVendorPhoneFilters(phoneNumber: string) {
  const digits = normalizeDigits(phoneNumber);
  const noPlus = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;
  const candidates = new Set<string>([
    phoneNumber,
    noPlus,
    digits
  ]);

  return Array.from(candidates).map(value => ({ phone: value }));
}

export async function resolveRolesForPhone(phoneNumber: string): Promise<{
  roles: UserRole[];
  vendorId?: string;
}> {
  const roles: UserRole[] = [];
  const digits = normalizeDigits(phoneNumber);

  if (digits && adminPhoneSet.has(digits)) {
    roles.push('admin');
  }

  const vendor = await prisma.vendor.findFirst({
    where: {
      OR: buildVendorPhoneFilters(phoneNumber)
    },
    select: {
      id: true
    }
  });

  if (vendor) {
    roles.push('vendor');
    return { roles, vendorId: vendor.id };
  }

  if (!roles.length) {
    logger.warn(
      { phoneNumber },
      'No roles could be resolved for phone number'
    );
    throw new CustomError(
      'Phone number is not authorized for access',
      403,
      ErrorType.AUTHORIZATION,
      ErrorSeverity.MEDIUM,
      true,
      { phoneNumber }
    );
  }

  return { roles };
}


