/**
 * Razorpay Route linked-account onboarding. Live calls need D1 Route enablement.
 */

import { env } from '../../config/env.js';
import { logger } from '../../logger.js';
import { readRazorpayErrorBody, throwRazorpayHttpError } from './razorpayHttpErrors.js';

export interface LinkedAccountEntity {
  id: string;
  status: string;
  holder_name_mismatch?: boolean;
}

export interface CreateLinkedAccountInput {
  email: string;
  phone: string;
  legalBusinessName: string;
  businessType: string;
  contactName: string;
  profile: {
    category: string;
    subcategory: string;
  };
  legalInfo: {
    pan: string;
    gst?: string;
  };
  bankAccount: {
    name: string;
    ifsc: string;
    account_number: string;
  };
  notes?: Record<string, string>;
}

export interface UpdateLinkedAccountBankInput {
  accountId: string;
  bankAccount: {
    name: string;
    ifsc: string;
    account_number: string;
  };
}

export interface LinkedAccountClient {
  createLinkedAccount(input: CreateLinkedAccountInput): Promise<LinkedAccountEntity>;
  updateLinkedAccountBank(input: UpdateLinkedAccountBankInput): Promise<LinkedAccountEntity>;
}

let clientOverride: LinkedAccountClient | null = null;

export function setLinkedAccountClientForTests(client: LinkedAccountClient | null): void {
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

class HttpLinkedAccountClient implements LinkedAccountClient {
  private async patchAccount(accountId: string, body: unknown): Promise<LinkedAccountEntity> {
    const res = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}`, {
      method: 'PATCH',
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await readRazorpayErrorBody(res);
      throwRazorpayHttpError({
        operation: 'patch_linked_account',
        httpStatus: res.status,
        rawBody: text,
        method: 'PATCH',
        path: `/v2/accounts/${accountId}`
      });
    }
    const parsed = (await res.json()) as { id: string; status?: string };
    return { id: parsed.id, status: parsed.status ?? 'updated' };
  }

  async createLinkedAccount(input: CreateLinkedAccountInput): Promise<LinkedAccountEntity> {
    const res = await fetch('https://api.razorpay.com/v2/accounts', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: input.email,
        phone: input.phone,
        legal_business_name: input.legalBusinessName,
        business_type: input.businessType,
        contact_name: input.contactName,
        profile: input.profile,
        legal_info: input.legalInfo,
        bank_account: input.bankAccount,
        notes: input.notes
      })
    });
    if (!res.ok) {
      const text = await readRazorpayErrorBody(res);
      throwRazorpayHttpError({
        operation: 'create_linked_account',
        httpStatus: res.status,
        rawBody: text,
        method: 'POST',
        path: '/v2/accounts',
        logContext: {
          vendorId: input.notes?.vendorId,
          businessType: input.businessType
        }
      });
    }
    const body = (await res.json()) as { id: string; status?: string };
    return { id: body.id, status: body.status ?? 'created' };
  }

  async updateLinkedAccountBank(input: UpdateLinkedAccountBankInput): Promise<LinkedAccountEntity> {
    return this.patchAccount(input.accountId, { bank_account: input.bankAccount });
  }
}

const httpClient = new HttpLinkedAccountClient();

export function getLinkedAccountClient(): LinkedAccountClient {
  return clientOverride ?? httpClient;
}

/** Dev / pre-D1: use FakeLinkedAccountClient when Route is not enabled on Razorpay yet. */
export async function bootstrapLinkedAccountClientFromEnv(): Promise<void> {
  const { env } = await import('../../config/env.js');
  if (env.RAZORPAY_USE_FAKE_ROUTE === 'true') {
    clientOverride = new FakeLinkedAccountClient();
    logger.info('Using FakeLinkedAccountClient (RAZORPAY_USE_FAKE_ROUTE=true)');
  }
}

export class FakeLinkedAccountClient implements LinkedAccountClient {
  accounts = new Map<string, LinkedAccountEntity & CreateLinkedAccountInput>();
  private seq = 0;

  async createLinkedAccount(input: CreateLinkedAccountInput): Promise<LinkedAccountEntity> {
    const id = `acc_fake_${++this.seq}`;
    const row = { id, status: 'created', ...input };
    this.accounts.set(id, row);
    return { id, status: 'created' };
  }

  async updateLinkedAccountBank(input: UpdateLinkedAccountBankInput): Promise<LinkedAccountEntity> {
    const row = this.accounts.get(input.accountId);
    if (!row) throw new Error('account not found');
    row.bankAccount = {
      name: input.bankAccount.name,
      ifsc: input.bankAccount.ifsc,
      account_number: input.bankAccount.account_number
    };
    row.status = 'updated';
    return { id: row.id, status: row.status };
  }

  activate(id: string): void {
    const row = this.accounts.get(id);
    if (row) row.status = 'activated';
  }
}
