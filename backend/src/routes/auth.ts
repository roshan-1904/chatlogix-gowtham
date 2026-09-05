import { Router, Request, Response } from 'express';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import { sendVerificationCode, verifyCode } from '../services/phoneAuth.js';
import { fetchRecaptchaParams } from '../services/recaptchaParams.js';
import { isFirebaseAuthConfigured } from '../config/env.js';
import { resolveRolesForPhone } from '../services/roleService.js';
import { generateAuthToken } from '../services/tokenService.js';
import { logger } from '../logger.js';

export const authRouter = Router();

authRouter.get(
  '/recaptcha-params',
  asyncHandler(async (_req: Request, res: Response) => {
    if (!isFirebaseAuthConfigured) {
      res.status(503).json({ error: 'Firebase phone auth is not configured' });
      return;
    }
    const params = await fetchRecaptchaParams();
    res.json(params);
  })
);

authRouter.post(
  '/send-code',
  asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber, recaptchaToken } = req.body ?? {};

    if (!phoneNumber) {
      throw createValidationError('phoneNumber is required', 'phoneNumber');
    }

    const { sessionInfo, delivery } = await sendVerificationCode(phoneNumber, recaptchaToken);

    logger.info({ phoneNumber, delivery }, 'OTP session created');

    res.json({
      sessionInfo,
      expiresIn: 120,
      delivery
    });
  })
);

authRouter.post(
  '/verify-code',
  asyncHandler(async (req: Request, res: Response) => {
    const { phoneNumber, sessionInfo, code } = req.body ?? {};

    if (!phoneNumber) {
      throw createValidationError('phoneNumber is required', 'phoneNumber');
    }
    if (!sessionInfo) {
      throw createValidationError('sessionInfo is required', 'sessionInfo');
    }
    if (!code) {
      throw createValidationError('code is required', 'code');
    }

    const verification = await verifyCode(sessionInfo, code);

    const normalizedRequestedPhone = phoneNumber.replace(/\s+/g, '');
    if (
      normalizedRequestedPhone &&
      verification.phoneNumber &&
      normalizeDigits(normalizedRequestedPhone) !== normalizeDigits(verification.phoneNumber)
    ) {
      throw createValidationError('Phone number does not match verification session', 'phoneNumber');
    }

    const { roles, vendorId } = await resolveRolesForPhone(verification.phoneNumber);

    const token = generateAuthToken({
      userId: verification.userId,
      phoneNumber: verification.phoneNumber,
      roles,
      vendorId
    });

    res.json({
      token,
      user: {
        phoneNumber: verification.phoneNumber,
        roles,
        vendorId
      },
      isNewUser: verification.isNewUser
    });
  })
);

function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}


