export type WalletTopUpClientAction =
  | { type: 'mock_confirm'; intentId: string }
  | { type: 'razorpay_checkout'; orderId: string; amountMilli: number };

export interface WalletPaymentProvider {
  readonly name: 'mock' | 'razorpay';
  createIntent(vendorId: string, amountMilli: number): Promise<{
    intentId: string;
    provider: 'mock' | 'razorpay';
    amountMilli: number;
    clientAction: WalletTopUpClientAction;
  }>;
  confirmMock?(vendorId: string, intentId: string): Promise<{
    balanceMilli: number;
    transactionId: string;
    alreadyCompleted?: boolean;
  }>;
}
