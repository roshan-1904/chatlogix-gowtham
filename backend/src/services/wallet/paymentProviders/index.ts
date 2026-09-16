import { walletEnv } from '../../../config/env.js';
import { mockWalletPaymentProvider } from './mockProvider.js';
import { razorpayWalletPaymentProvider } from './razorpayProvider.js';
import type { WalletPaymentProvider } from './types.js';

export function getWalletPaymentProvider(): WalletPaymentProvider {
  if (walletEnv.paymentProvider === 'razorpay') {
    return razorpayWalletPaymentProvider;
  }
  return mockWalletPaymentProvider;
}
