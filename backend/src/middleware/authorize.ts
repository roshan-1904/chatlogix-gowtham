import { Request, Response, NextFunction } from 'express';
import { CustomError, ErrorType, ErrorSeverity } from './errorHandler.js';
import { UserRole } from '../services/tokenService.js';

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw new CustomError(
        'Authentication required',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    const hasRole = user.roles.some((role: UserRole) => allowedRoles.includes(role));
    if (!hasRole) {
      throw new CustomError(
        'You do not have permission to perform this action',
        403,
        ErrorType.AUTHORIZATION,
        ErrorSeverity.MEDIUM,
        true,
        { requiredRoles: allowedRoles, userRoles: user.roles }
      );
    }

    next();
  };
}

export function requireVendorAccess(extractVendorId: (req: Request) => string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw new CustomError(
        'Authentication required',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    const vendorId = extractVendorId(req);
    if (!vendorId) {
      throw new CustomError(
        'Vendor ID is required',
        400,
        ErrorType.VALIDATION,
        ErrorSeverity.MEDIUM
      );
    }

    if (user.roles.includes('admin')) {
      return next();
    }

    if (user.roles.includes('vendor') && user.vendorId === vendorId) {
      return next();
    }

    // Enhanced error message for debugging
    const errorMessage = user.roles.includes('vendor')
      ? `You are not authorized to access vendor ${vendorId}. Your vendor ID is ${user.vendorId || 'not set'}.`
      : 'You are not authorized to access this vendor';

    throw new CustomError(
      errorMessage,
      403,
      ErrorType.AUTHORIZATION,
      ErrorSeverity.MEDIUM,
      true,
      { vendorId, userVendorId: user.vendorId, userRoles: user.roles }
    );
  };
}


