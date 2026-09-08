import { prisma } from '../db/prisma.js';
import { UserRole } from './tokenService.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';
import { CustomError, ErrorType, ErrorSeverity } from '../middleware/errorHandler.js';
import { buildVendorPhoneFilters } from '../utils/phoneNormalize.js';

const adminPhoneSet = new Set(
  (env.AUTH_ADMIN_PHONES || '')
    .split(',')
    .map((phone) => phone.trim())
    .filter(Boolean)
    .map(normalizeDigits)
);

function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export async function resolveRolesForPhone(phoneNumber: string): Promise<{
  roles: UserRole[];
  vendorId?: string;
  registrationStatus?: string;
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
      id: true,
      registrationStatus: true
    }
  });

  if (vendor) {
    roles.push('vendor');
    return {
      roles,
      vendorId: vendor.id,
      registrationStatus: vendor.registrationStatus
    };
  }

  if (!roles.length) {
    logger.warn({ phoneNumber }, 'No roles could be resolved for phone number');
    throw new CustomError(
      'Phone number is not registered. Please sign up to create your trial shop.',
      403,
      ErrorType.AUTHORIZATION,
      ErrorSeverity.MEDIUM,
      true,
      { code: 'phone_not_registered' }
    );
  }

  return { roles };
}
