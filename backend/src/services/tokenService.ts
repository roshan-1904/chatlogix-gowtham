import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  CustomError,
  ErrorType,
  ErrorSeverity
} from '../middleware/errorHandler.js';

export type UserRole = 'admin' | 'vendor';

export interface AuthTokenPayload {
  userId: string;
  phoneNumber: string;
  roles: UserRole[];
  vendorId?: string;
  registrationStatus?: string;
}

const JWT_SECRET: Secret = env.AUTH_JWT_SECRET;
const DEFAULT_EXPIRES_IN: string | number =
  env.AUTH_ACCESS_TOKEN_EXPIRES_IN || env.AUTH_TOKEN_EXPIRES_IN || '1h';

export function generateAuthToken(
  payload: AuthTokenPayload,
  expiresIn: string | number = DEFAULT_EXPIRES_IN
): string {
  const options: SignOptions = { expiresIn: expiresIn as any };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || typeof decoded !== 'object') {
      throw new CustomError(
        'Invalid authentication token',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    const { userId, phoneNumber, roles, vendorId, registrationStatus } = decoded as AuthTokenPayload;

    if (!userId || !phoneNumber || !Array.isArray(roles)) {
      throw new CustomError(
        'Authentication token is missing required fields',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    return {
      userId,
      phoneNumber,
      roles,
      vendorId,
      registrationStatus
    };
  } catch (error: any) {
    if (error instanceof CustomError) {
      throw error;
    }

    throw new CustomError(
      'Authentication token could not be verified',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM,
      true,
      { name: error?.name }
    );
  }
}


