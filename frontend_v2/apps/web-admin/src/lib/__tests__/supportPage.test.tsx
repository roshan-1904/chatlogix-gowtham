import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Support } from '../../pages/Support';
import { SupportNewCase } from '../../pages/SupportNewCase';
import { SupportCaseDetail } from '../../pages/SupportCaseDetail';
import { SupportConversation } from '../../pages/SupportConversation';
import * as supportApi from '../support';
import * as vendorsApi from '../vendors';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockCases: supportApi.StaffCase[] = [
  {
    id: 'case-1',
    vendorId: 'vendor-1',
    subject: 'Graph 500 error on outbound WhatsApp',
    status: 'open',
    conversationId: 'conv-101',
    openedBy: 'staff-admin-1',
    createdAt: '2026-11-09T08:00:00Z',
    updatedAt: '2026-11-09T08:30:00Z',
    vendor: {
      id: 'vendor-1',
      businessName: 'Annapoorna Foods',
    },
    notes: [
      {
        id: 'note-1',
        caseId: 'case-1',
        authorId: 'staff-admin-1',
        body: 'Contacted vendor regarding outbound reply failures.',
        createdAt: '2026-11-09T08:15:00Z',
      },
    ],
  },
  {
    id: 'case-2',
    vendorId: 'vendor-2',
    subject: 'Wallet not refilling after payment',
    status: 'waiting',
    conversationId: null,
    openedBy: 'staff-admin-2',
    createdAt: '2026-11-09T07:00:00Z',
    updatedAt: '2026-11-09T07:45:00Z',
    vendor: {
      id: 'vendor-2',
      businessName: 'Bakery Delights',
    },
    notes: [],
  },
  {
    id: 'case-3',
    vendorId: 'vendor-3',
    subject: 'Catalog import pricing discrepancy',
    status: 'resolved',
    conversationId: null,
    openedBy: 'staff-admin-1',
    createdAt: '2026-11-08T12:00:00Z',
    updatedAt: '2026-11-08T15:00:00Z',
    vendor: {
      id: 'vendor-3',
      businessName: 'Chennai Spices',
    },
    notes: [
      {
        id: 'note-sys',
        caseId: 'case-3',
        authorId: 'system',
        body: 'Status set to resolved by staff-admin-1.',
        createdAt: '2026-11-08T15:00:00Z',
      },
    ],
  },
];

const mockVendors: vendorsApi.AdminVendorListRow[] = [
  {
    id: 'vendor-1',
    businessName: 'Annapoorna Foods',
    phone: '+919876543210',
    email: 'annapoorna@example.com',
    subscriptionPlan: 'pro',
    subscriptionStatus: 'active',
    walletBalanceMilli: 12400,
    markupPercent: 50,
    registrationStatus: 'registered',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'vendor-2',
    businessName: 'Bakery Delights',
    phone: '+919876543222',
    email: 'bakery@example.com',
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    walletBalanceMilli: 0,
    markupPercent: 40,
    registrationStatus: 'registered',
    createdAt: '2026-10-05T00:00:00Z',
  },
];

const mockShopContext: supportApi.ShopContext = {
  vendor: {
    id: 'vendor-1',
    businessName: 'Annapoorna Foods',
    walletBalanceMilli: 12400,
    markupPercent: 50,
  },
  whatsapp: {
    phoneNumber: '+919876543210',
    connectStatus: 'live',
  },
  lastFailure: {
    id: 'msg-fail-1',
    conversationId: 'conv-101',
    timestamp: '2026-11-09T08:00:00Z',
    failureReason: 'Graph 500 error on outbound WhatsApp',
    preview: 'Unable to send message to customer',
  },
  openQuestions: [
    {
      id: 'q-1',
      questionEn: 'Do you deliver to T. Nagar?',
      category: 'delivery',
      hitCount: 5,
      lastSeenAt: '2026-11-09T07:30:00Z',
      status: 'open',
    },
  ],
};

const mockAuditedConversation: supportApi.AuditedConversation = {
  conversationId: 'conv-101',
  vendor: {
    id: 'vendor-1',
    businessName: 'Annapoorna Foods',
  },
  customer: {
    id: 'cust-1',
    phone: '+919876543210',
  },
  auditRecorded: true,
  messages: [
    {
      id: 'm-1',
      senderType: 'customer',
      timestamp: '2026-11-09T07:59:00Z',
      content: 'Do you have 1kg ghee in stock?',
      contentEn: null,
      status: 'delivered',
    },
    {
      id: 'm-2',
      senderType: 'assistant',
      timestamp: '2026-11-09T08:00:00Z',
      content: 'Yes, 1kg ghee is available for ₹650.',
      contentEn: 'Yes, 1kg ghee is available for ₹650.',
      status: 'failed',
    },
  ],
};

function changeInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function changeTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  nativeTextareaValueSetter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Support Pages Integration Tests', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.spyOn(supportApi, 'listCases').mockResolvedValue({
      supported: true,
      items: mockCases,
      count: mockCases.length,
    });
    vi.spyOn(supportApi, 'getCase').mockResolvedValue(mockCases[0]);
    vi.spyOn(supportApi, 'createCase').mockResolvedValue(mockCases[0]);
    vi.spyOn(supportApi, 'updateCaseStatus').mockResolvedValue({
      ...mockCases[0],
      status: 'waiting',
    });
    vi.spyOn(supportApi, 'addCaseNote').mockResolvedValue({
      id: 'new-note-1',
      caseId: 'case-1',
      authorId: 'staff-admin-1',
      body: 'New note content',
      createdAt: '2026-11-09T09:00:00Z',
    });
    vi.spyOn(supportApi, 'getShopContext').mockResolvedValue(mockShopContext);
    vi.spyOn(supportApi, 'getAuditedConversation').mockResolvedValue(mockAuditedConversation);
    vi.spyOn(vendorsApi, 'listVendors').mockResolvedValue(mockVendors);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const renderWithRouter = async (initialEntries: string[]) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={initialEntries}>
            <Routes>
              <Route path="/support" element={<Support />} />
              <Route path="/support/new" element={<SupportNewCase />} />
              <Route path="/support/:caseId" element={<SupportCaseDetail />} />
              <Route
                path="/support/conversations/:conversationId"
                element={<SupportConversation />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    // Allow promises to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  };

  describe('1. Support Page List Rendering & Filters', () => {
    it('renders the case list with subject, shop, status, and new case button', async () => {
      await renderWithRouter(['/support']);

      expect(container.textContent).toContain('Support Cases');
      expect(container.textContent).toContain('Staff follow-up on shops.');
      expect(container.textContent).toContain('Graph 500 error on outbound WhatsApp');
      expect(container.textContent).toContain('Annapoorna Foods');
      expect(container.textContent).toContain('+ New Case');

      const newCaseLink = container.querySelector('a[href="/support/new"]');
      expect(newCaseLink).not.toBeNull();
    });

    it('renders status filter tabs and triggers refetch on tab change', async () => {
      await renderWithRouter(['/support']);

      const buttons = Array.from(container.querySelectorAll('button'));
      const waitingBtn = buttons.find((b) => b.textContent?.trim() === 'Waiting');
      expect(waitingBtn).toBeDefined();

      await act(async () => {
        waitingBtn?.click();
      });

      expect(supportApi.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'waiting' })
      );
    });

    it('displays pending migration banner when database migration is pending', async () => {
      vi.spyOn(supportApi, 'listCases').mockResolvedValueOnce({
        supported: false,
        status: 'pending_migration',
        message: 'StaffCase persistence requires schema migration approval (Decision 3).',
        items: [],
        count: 0,
      });

      await renderWithRouter(['/support']);

      expect(container.textContent).toContain('Database Migration Pending — Staff Case Persistence');
      expect(container.textContent).toContain('StaffCase, StaffCaseNote, and StaffAuditLog');
    });

    it('renders empty state when no cases match criteria', async () => {
      vi.spyOn(supportApi, 'listCases').mockResolvedValueOnce({
        supported: true,
        items: [],
        count: 0,
      });

      await renderWithRouter(['/support']);

      expect(container.textContent).toContain('No open cases');
      expect(container.textContent).toContain('Click "New Case" above to document a vendor follow-up');
    });
  });

  describe('2. SupportNewCase Page & Deep Links', () => {
    it('pre-fills and locks vendorId and conversationId when launched from deep link', async () => {
      await renderWithRouter(['/support/new?vendorId=vendor-1&conversationId=conv-101']);

      expect(container.textContent).toContain('Open Support Case');
      expect(container.textContent).toContain('Annapoorna Foods');
      expect(container.textContent).toContain('Locked from Link');

      const convInput = container.querySelector('input[value="conv-101"]') as HTMLInputElement;
      expect(convInput).not.toBeNull();
    });

    it('validates subject length (3-140 chars) and enables submit button only when valid', async () => {
      await renderWithRouter(['/support/new?vendorId=vendor-1']);

      const submitBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Create Support Case'
      ) as HTMLButtonElement;

      // Initially empty -> disabled
      expect(submitBtn.disabled).toBe(true);

      const subjectInput = container.querySelector(
        'input[placeholder*="Graph 500"]'
      ) as HTMLInputElement;

      // Too short (< 3 chars)
      await act(async () => {
        changeInputValue(subjectInput, 'ab');
      });
      expect(submitBtn.disabled).toBe(true);

      // Valid (>= 3 chars)
      await act(async () => {
        changeInputValue(subjectInput, 'Wallet recharge failed via Razorpay');
      });
      expect(submitBtn.disabled).toBe(false);
    });
  });

  describe('3. SupportCaseDetail Page & Status Transitions', () => {
    it('renders case details, timeline notes, and context card', async () => {
      await renderWithRouter(['/support/case-1']);

      // Extra tick for ShopContextCard query
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(container.textContent).toContain('Graph 500 error on outbound WhatsApp');
      expect(container.textContent).toContain('Shop: Annapoorna Foods');
      expect(container.textContent).toContain('Case Notes & Timeline');
      expect(container.textContent).toContain(
        'Contacted vendor regarding outbound reply failures.'
      );
      // ShopContextCard items
      expect(container.textContent).toContain('Shop Context');
      expect(container.textContent).toContain('₹12.40');
      expect(container.textContent).toContain('50%');
      expect(container.textContent).toContain('live');
      expect(container.textContent).toContain('Do you deliver to T. Nagar?');
    });

    it('displays allowed status transitions for open case (Mark Waiting, Resolve)', async () => {
      await renderWithRouter(['/support/case-1']);

      const buttons = Array.from(container.querySelectorAll('button'));
      const markWaitingBtn = buttons.find((b) => b.textContent?.trim() === 'Mark Waiting');
      const resolveBtn = buttons.find((b) => b.textContent?.trim() === 'Resolve Case');

      expect(markWaitingBtn).toBeDefined();
      expect(resolveBtn).toBeDefined();

      await act(async () => {
        markWaitingBtn?.click();
      });

      expect(supportApi.updateCaseStatus).toHaveBeenCalledWith('case-1', 'waiting');
    });

    it('submits a new note to the timeline', async () => {
      await renderWithRouter(['/support/case-1']);

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      const addNoteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Add Note'
      ) as HTMLButtonElement;

      await act(async () => {
        changeTextareaValue(textarea, 'Called vendor; issue resolved.');
      });

      await act(async () => {
        addNoteBtn.click();
      });

      expect(supportApi.addCaseNote).toHaveBeenCalledWith(
        'case-1',
        'Called vendor; issue resolved.'
      );
    });
  });

  describe('4. SupportConversation Transcript Reader & Audit Gate', () => {
    it('renders customer and assistant messages with audit notice on success', async () => {
      await renderWithRouter(['/support/conversations/conv-101?caseId=case-1']);

      expect(container.textContent).toContain('Customer Conversation Transcript');
      expect(container.textContent).toContain('Audited Conversation Read');
      expect(container.textContent).toContain('Do you have 1kg ghee in stock?');
      expect(container.textContent).toContain('Yes, 1kg ghee is available for ₹650.');
      expect(container.textContent).toContain('Annapoorna Foods');
      expect(container.textContent).toContain('+919876543210');
    });

    it('FAILS CLOSED and blocks transcript display if audit logging fails', async () => {
      const auditError = new Error('Could not record this read. The conversation was not opened.');
      (auditError as any).response = {
        data: {
          error: 'audit_failed',
          message: 'Could not record this read. The conversation was not opened.',
        },
      };
      vi.spyOn(supportApi, 'getAuditedConversation').mockRejectedValueOnce(auditError);

      await renderWithRouter(['/support/conversations/conv-fail?caseId=case-1']);

      expect(container.textContent).toContain(
        'Could not record this read. The conversation was not opened.'
      );
      // Messages must NEVER be present
      expect(container.textContent).not.toContain('Do you have 1kg ghee in stock?');
    });
  });
});
