declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: () => void) => void };
  }
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

export function loadRazorpayCheckoutScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout requires a browser'));
  }
  if (window.Razorpay) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay Checkout')));
      return;
    }
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
    document.body.appendChild(script);
  });
}

export interface OpenRazorpayCheckoutInput {
  keyId: string;
  orderId: string;
  amountPaise: number;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

export interface OpenRazorpayMandateCheckoutInput {
  keyId: string;
  orderId: string;
  customerId: string;
  amountPaise: number;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

export async function openRazorpayMandateCheckout(input: OpenRazorpayMandateCheckoutInput): Promise<void> {
  await loadRazorpayCheckoutScript();
  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout is unavailable');
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: input.keyId,
      amount: input.amountPaise,
      currency: 'INR',
      name: input.name ?? 'ChatLogix',
      description: input.description ?? 'UPI auto-recharge mandate',
      order_id: input.orderId,
      customer_id: input.customerId,
      recurring: '1',
      prefill: input.prefill,
      handler: () => resolve(),
      modal: {
        ondismiss: () => reject(new Error('Mandate registration cancelled'))
      }
    });
    rzp.on('payment.failed', () => reject(new Error('Mandate registration failed')));
    rzp.open();
  });
}

export async function openRazorpayCheckout(input: OpenRazorpayCheckoutInput): Promise<void> {
  await loadRazorpayCheckoutScript();
  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout is unavailable');
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: input.keyId,
      amount: input.amountPaise,
      currency: 'INR',
      name: input.name ?? 'ChatLogix',
      description: input.description ?? 'AI wallet top-up',
      order_id: input.orderId,
      prefill: input.prefill,
      handler: () => resolve(),
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled'))
      }
    });
    rzp.on('payment.failed', () => reject(new Error('Payment failed')));
    rzp.open();
  });
}
