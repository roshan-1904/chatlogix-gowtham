/**
 * Razorpay REST fetches used by the webhook ingress (payments, refunds, transfers).
 * Unit tests inject FakeRazorpayApiClient; production uses basic auth over HTTPS.
 */

import { env } from '../../config/env.js';
import { readRazorpayErrorBody, throwRazorpayHttpError } from './razorpayHttpErrors.js';

export interface RazorpayPaymentEntity {
  id: string;
  amount: number;
  currency: string;
  status: string;
  fee?: number;
  tax?: number;
  notes?: Record<string, string>;
  order_id?: string;
}

export interface RazorpayRefundEntity {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  notes?: Record<string, string>;
}

export interface RazorpayTransferEntity {
  id: string;
  amount: number;
  status: string;
  notes?: Record<string, string>;
}

export interface RazorpayDisputeEntity {
  id: string;
  payment_id: string;
  amount: number;
  amount_deducted?: number;
  status: string;
}

export interface RazorpayOrderEntity {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
}

export interface CreateRazorpayOrderInput {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes: Record<string, string>;
}

export interface RazorpayCustomerEntity {
  id: string;
  email?: string;
  contact?: string;
}

export interface CreateRazorpayCustomerInput {
  name: string;
  email: string;
  contact: string;
  notes?: Record<string, string>;
}

export interface CreateMandateRegistrationOrderInput {
  customerId: string;
  maxAmountPaise: number;
  receipt: string;
  notes: Record<string, string>;
  tokenExpireAtUnix: number;
}

export interface RecurringPreDebitNotifyInput {
  customerId: string;
  tokenId: string;
  amountPaise: number;
  debitAtUnix: number;
}

export interface CreateRecurringPaymentInput {
  email: string;
  contact: string;
  amountPaise: number;
  orderId: string;
  customerId: string;
  tokenId: string;
  description: string;
}

export interface RazorpayRecurringPaymentEntity {
  razorpay_payment_id: string;
}

export interface RazorpayApiClient {
  fetchPayment(paymentId: string): Promise<RazorpayPaymentEntity>;
  fetchRefund(refundId: string): Promise<RazorpayRefundEntity>;
  fetchTransfer(transferId: string): Promise<RazorpayTransferEntity>;
  fetchDispute(disputeId: string): Promise<RazorpayDisputeEntity>;
  createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrderEntity>;
  createCustomer(input: CreateRazorpayCustomerInput): Promise<RazorpayCustomerEntity>;
  createMandateRegistrationOrder(input: CreateMandateRegistrationOrderInput): Promise<RazorpayOrderEntity>;
  cancelCustomerToken(customerId: string, tokenId: string): Promise<void>;
  notifyRecurringPreDebit(input: RecurringPreDebitNotifyInput): Promise<void>;
  createRecurringPayment(input: CreateRecurringPaymentInput): Promise<RazorpayRecurringPaymentEntity>;
}

let clientOverride: RazorpayApiClient | null = null;

export function setRazorpayApiClientForTests(client: RazorpayApiClient | null): void {
  clientOverride = client;
}

function authHeader(): string {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay API credentials are not configured');
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

async function razorpayRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  if (!res.ok) {
    const text = await readRazorpayErrorBody(res);
    throwRazorpayHttpError({
      operation: 'api_request',
      httpStatus: res.status,
      rawBody: text,
      method,
      path: `/v1${path}`
    });
  }
  return (await res.json()) as T;
}

async function razorpayGet<T>(path: string): Promise<T> {
  return razorpayRequest<T>('GET', path);
}

class HttpRazorpayApiClient implements RazorpayApiClient {
  fetchPayment(paymentId: string): Promise<RazorpayPaymentEntity> {
    return razorpayGet(`/payments/${paymentId}`);
  }
  fetchRefund(refundId: string): Promise<RazorpayRefundEntity> {
    return razorpayGet(`/refunds/${refundId}`);
  }
  fetchTransfer(transferId: string): Promise<RazorpayTransferEntity> {
    return razorpayGet(`/transfers/${transferId}`);
  }
  fetchDispute(disputeId: string): Promise<RazorpayDisputeEntity> {
    return razorpayGet(`/disputes/${disputeId}`);
  }

  createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrderEntity> {
    return razorpayRequest<RazorpayOrderEntity>('POST', '/orders', {
      amount: input.amountPaise,
      currency: input.currency ?? 'INR',
      receipt: input.receipt,
      notes: input.notes
    });
  }

  createCustomer(input: CreateRazorpayCustomerInput): Promise<RazorpayCustomerEntity> {
    return razorpayRequest<RazorpayCustomerEntity>('POST', '/customers', {
      name: input.name,
      email: input.email,
      contact: input.contact,
      fail_existing: '0',
      ...(input.notes ? { notes: input.notes } : {})
    });
  }

  createMandateRegistrationOrder(input: CreateMandateRegistrationOrderInput): Promise<RazorpayOrderEntity> {
    return razorpayRequest<RazorpayOrderEntity>('POST', '/orders', {
      amount: 0,
      currency: 'INR',
      payment_capture: true,
      method: 'upi',
      customer_id: input.customerId,
      receipt: input.receipt,
      notes: input.notes,
      token: {
        max_amount: input.maxAmountPaise,
        expire_at: input.tokenExpireAtUnix,
        frequency: 'as_presented'
      }
    });
  }

  cancelCustomerToken(customerId: string, tokenId: string): Promise<void> {
    return razorpayRequest<void>('POST', `/customers/${customerId}/tokens/${tokenId}/cancel`, {});
  }

  notifyRecurringPreDebit(input: RecurringPreDebitNotifyInput): Promise<void> {
    return razorpayRequest<void>('POST', '/payments/notify/recurring', {
      sms_notify: 1,
      email_notify: 1,
      customer_id: input.customerId,
      token_id: input.tokenId,
      recurring: {
        amount: input.amountPaise,
        currency: 'INR',
        notify_at: input.debitAtUnix
      }
    });
  }

  createRecurringPayment(input: CreateRecurringPaymentInput): Promise<RazorpayRecurringPaymentEntity> {
    return razorpayRequest<RazorpayRecurringPaymentEntity>('POST', '/payments/create/recurring', {
      email: input.email,
      contact: input.contact,
      amount: input.amountPaise,
      currency: 'INR',
      order_id: input.orderId,
      customer_id: input.customerId,
      token: input.tokenId,
      recurring: '1',
      description: input.description
    });
  }
}

const httpClient = new HttpRazorpayApiClient();

export function getRazorpayApiClient(): RazorpayApiClient {
  return clientOverride ?? httpClient;
}

export class FakeRazorpayApiClient implements RazorpayApiClient {
  payments = new Map<string, RazorpayPaymentEntity>();
  refunds = new Map<string, RazorpayRefundEntity>();
  transfers = new Map<string, RazorpayTransferEntity>();
  disputes = new Map<string, RazorpayDisputeEntity>();
  disputesByPayment = new Map<string, RazorpayDisputeEntity[]>();

  async disputesForPayment(paymentId: string): Promise<RazorpayDisputeEntity[]> {
    return [...(this.disputesByPayment.get(paymentId) ?? [])];
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPaymentEntity> {
    const row = this.payments.get(paymentId);
    if (!row) throw new Error(`payment not found: ${paymentId}`);
    return row;
  }

  async fetchRefund(refundId: string): Promise<RazorpayRefundEntity> {
    const row = this.refunds.get(refundId);
    if (!row) throw new Error(`refund not found: ${refundId}`);
    return row;
  }

  async fetchTransfer(transferId: string): Promise<RazorpayTransferEntity> {
    const row = this.transfers.get(transferId);
    if (!row) throw new Error(`transfer not found: ${transferId}`);
    return row;
  }

  async fetchDispute(disputeId: string): Promise<RazorpayDisputeEntity> {
    const row = this.disputes.get(disputeId);
    if (!row) throw new Error(`dispute not found: ${disputeId}`);
    return row;
  }

  orders = new Map<string, RazorpayOrderEntity>();
  customers = new Map<string, RazorpayCustomerEntity>();
  cancelledTokens = new Set<string>();
  preDebitNotifications: RecurringPreDebitNotifyInput[] = [];
  recurringPayments: CreateRecurringPaymentInput[] = [];

  async createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrderEntity> {
    const id = `order_${this.orders.size + 1}`;
    const row: RazorpayOrderEntity = {
      id,
      amount: input.amountPaise,
      currency: input.currency ?? 'INR',
      status: 'created',
      notes: input.notes
    };
    this.orders.set(id, row);
    return row;
  }

  async createCustomer(input: CreateRazorpayCustomerInput): Promise<RazorpayCustomerEntity> {
    const id = `cust_${this.customers.size + 1}`;
    const row: RazorpayCustomerEntity = { id, email: input.email, contact: input.contact };
    this.customers.set(id, row);
    return row;
  }

  async createMandateRegistrationOrder(input: CreateMandateRegistrationOrderInput): Promise<RazorpayOrderEntity> {
    return this.createOrder({
      amountPaise: input.maxAmountPaise,
      receipt: input.receipt,
      notes: input.notes
    });
  }

  async cancelCustomerToken(customerId: string, tokenId: string): Promise<void> {
    this.cancelledTokens.add(`${customerId}:${tokenId}`);
  }

  async notifyRecurringPreDebit(input: RecurringPreDebitNotifyInput): Promise<void> {
    this.preDebitNotifications.push(input);
  }

  async createRecurringPayment(input: CreateRecurringPaymentInput): Promise<RazorpayRecurringPaymentEntity> {
    this.recurringPayments.push(input);
    return { razorpay_payment_id: `pay_recurring_${this.recurringPayments.length}` };
  }
}
