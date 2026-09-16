import { createError, ErrorType } from '../../../middleware/errorHandler.js';
import type { WalletPaymentProvider } from './types.js';

export const razorpayWalletPaymentProvider: WalletPaymentProvider = {
  name: 'razorpay',

  async createIntent() {
    throw createError('Razorpay wallet top-up is not implemented yet', 501, ErrorType.PAYMENT, undefined, {
      error: 'razorpay_not_implemented'
    });
  }
};
