import { Request, Response, NextFunction } from 'express';
import {
  CustomError,
  ErrorType,
  ErrorSeverity
} from './errorHandler.js';
import { verifyAuthToken, AuthTokenPayload } from '../services/tokenService.js';

type AuthenticatedUser = AuthTokenPayload & {
  id: string;
  [key: string]: any;
};

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.get('authorization') || req.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new CustomError(
      'Authentication token missing',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new CustomError(
      'Authentication token missing',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  const payload = verifyAuthToken(token);
  const authenticatedUser: AuthenticatedUser = {
    id: payload.userId,
    ...payload
  };

  req.user = authenticatedUser;

  next();
}


