import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Vendors } from '../../pages/Vendors';
import * as vendorsApi from '../vendors';

const mockVendors: vendorsApi.AdminVendorListRow[] = [
  {
    id: 'vendor-1',
    businessName: 'Annapoorna Foods',
    phone: '+919876543210',
    email: 'annapoorna@example.com',
    subscriptionPlan: 'pro',
    subscriptionStatus: 'active',
    registrationStatus: 'approved',
    submittedAt: '2026-10-01T10:00:00Z',
    walletBalanceMilli: 45000,
    markupPercent: 50,
    createdAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'vendor-2',
    businessName: 'Bakery Delights',
    phone: '+919123456780',
    email: 'bakery@example.com',
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    registrationStatus: 'pending_approval',
    submittedAt: '2026-10-05T12:00:00Z',
    walletBalanceMilli: 12000,
    markupPercent: 60,
    createdAt: '2026-09-10T10:00:00Z',
  },
];

vi.mock('../vendors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../vendors')>();
  return {
    ...actual,
    listVendors: vi.fn(),
    getVendorConfig: vi.fn(),
    getVendorWalletTransactions: vi.fn().mockResolvedValue([]),
    getVendorWhatsAppNumbers: vi.fn().mockResolvedValue([]),
    getVendorFeatureFlags: vi.fn().mockResolvedValue({ conversation_turn_audit: false }),
    getAdminSettlementView: vi.fn().mockResolvedValue({
      releasesFrozenAt: null,
      releasesFrozenReason: null,
      rollingReserveBps: 0,
      position: { heldMilli: '0', reserveMilli: '0', releasedMilli: '0', owedMilli: '0' },
    }),
    listVendorPlatformFeeInvoices: vi.fn().mockResolvedValue([]),
  };
});

describe('Vendor Deep Link Routing and Wallet Hash Auto-Scroll', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });

    vi.mocked(vendorsApi.listVendors).mockResolvedValue(mockVendors);
    vi.mocked(vendorsApi.getVendorConfig).mockImplementation(async (id: string) => {
      const v = mockVendors.find((m) => m.id === id) || mockVendors[0];
      const isVendor1 = v.id === 'vendor-1';
      return {
        id: v.id,
        businessName: v.businessName,
        plan: v.subscriptionPlan,
        status: v.subscriptionStatus,
        walletBalanceMilli: v.walletBalanceMilli,
        markupPercent: v.markupPercent,
        paymentFeeBps: 100,
        paymentsManagedByChatlogix: false,
        paymentLinkAutoSend: false,
        category: 'Food',
        catalogImportEnabled: false,
        trialGrantedMilli: isVendor1 ? 50000 : null,
        trialExpiresAt: isVendor1 ? '2026-11-30T10:00:00Z' : null,
        aiModel: isVendor1 ? 'gpt-5.6-luna' : null,
        ai: {},
      };
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderWithRouter(initialEntry: string) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/vendors" element={<Vendors />} />
              <Route path="/vendors/:vendorId" element={<Vendors />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    // Wait for microtasks and React Query resolution
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
  }

  it('preserves /vendors route and defaults to selecting the first visible vendor', async () => {
    await renderWithRouter('/vendors');

    expect(container.textContent).toContain('Annapoorna Foods');
    expect(container.textContent).toContain('Bakery Delights');

    // Annapoorna Foods is first, so its detail header should be rendered
    const detailHeadings = Array.from(container.querySelectorAll('h2'));
    const isFirstSelected = detailHeadings.some((h) => h.textContent?.includes('Annapoorna Foods'));
    expect(isFirstSelected).toBe(true);
  });

  it('deep links to /vendors/:vendorId and automatically selects the specified vendor', async () => {
    await renderWithRouter('/vendors/vendor-2');

    expect(container.textContent).toContain('Annapoorna Foods');
    expect(container.textContent).toContain('Bakery Delights');

    // Vendor-2 (Bakery Delights) must be selected in the detail panel
    const detailHeadings = Array.from(container.querySelectorAll('h2'));
    const isVendor2Selected = detailHeadings.some((h) => h.textContent?.includes('Bakery Delights'));
    expect(isVendor2Selected).toBe(true);
  });

  it('renders a clear Not-Found card when vendorId does not exist without crashing', async () => {
    await renderWithRouter('/vendors/invalid-vendor-999');

    expect(container.textContent).toContain('Could not load this shop.');
    expect(container.textContent).toContain('invalid-vendor-999');
    expect(container.textContent).toContain('Back to all vendors');

    // The left sidebar list should still render the available vendors
    expect(container.textContent).toContain('Annapoorna Foods');
    expect(container.textContent).toContain('Bakery Delights');
  });

  it('scrolls #wallet into view when URL hash is #wallet', async () => {
    // Mock scrollIntoView
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    await renderWithRouter('/vendors/vendor-1#wallet');

    // Wait for the smooth scroll timer
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: 'smooth',
        block: 'start',
      })
    );
  });

  it('does not repeatedly scroll on subsequent re-renders once scrolled', async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    await renderWithRouter('/vendors/vendor-1#wallet');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const initialCallCount = scrollIntoViewMock.mock.calls.length;
    expect(initialCallCount).toBeGreaterThan(0);

    // Trigger state change / re-render
    await act(async () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendor', 'vendor-1'] });
      await new Promise((r) => setTimeout(r, 80));
    });

    // Should not have triggered additional scrollIntoView calls
    expect(scrollIntoViewMock.mock.calls.length).toBe(initialCallCount);
  });

  it('displays trial details and AI model when configured', async () => {
    await renderWithRouter('/vendors/vendor-1');

    await act(async () => {
      for (let i = 0; i < 15; i++) {
        if (container.textContent?.includes('gpt-5.6-luna')) break;
        await new Promise((r) => setTimeout(r, 40));
      }
    });

    expect(container.textContent).toContain('Trial granted');
    expect(container.textContent).toContain('₹50.00');
    expect(container.textContent).toContain('Trial expiry');
    expect(container.textContent).toContain('2026');
    expect(container.textContent).toContain('AI model');
    expect(container.textContent).toContain('gpt-5.6-luna');
  });

  it('displays clear fallback text when trial details or AI model are missing/null', async () => {
    await renderWithRouter('/vendors/vendor-2');

    expect(container.textContent).toContain('Trial granted');
    expect(container.textContent).toContain('No trial granted');
    expect(container.textContent).toContain('Trial expiry');
    expect(container.textContent).toContain('No expiry set');
    expect(container.textContent).toContain('AI model');
    expect(container.textContent).toContain('Not configured');
  });

  it('displays category, registration status badge, and low balance badge correctly', async () => {
    // vendor-2 has walletBalanceMilli = 12000 (< 20000), registrationStatus = 'pending_approval'
    await renderWithRouter('/vendors/vendor-2');

    await act(async () => {
      for (let i = 0; i < 15; i++) {
        if (container.textContent?.includes('Food')) break;
        await new Promise((r) => setTimeout(r, 40));
      }
    });

    // Category in subheader
    expect(container.textContent).toContain('Food');

    // Registration badge in header
    expect(container.textContent).toContain('Pending Approval');

    // Low balance warning badge
    expect(container.textContent).toContain('Low balance');

    // Conditional onboarding card
    expect(container.textContent).toContain('Waiting for review');
    expect(container.textContent).toContain('This shop has submitted its onboarding profile and is pending approval.');
  });

  it('does not display low balance badge or onboarding card for approved vendor with sufficient balance', async () => {
    // vendor-1 has walletBalanceMilli = 45000 (>= 20000), registrationStatus = 'approved'
    await renderWithRouter('/vendors/vendor-1');

    await act(async () => {
      for (let i = 0; i < 15; i++) {
        if (container.textContent?.includes('Approved')) break;
        await new Promise((r) => setTimeout(r, 40));
      }
    });

    expect(container.textContent).toContain('Approved');
    expect(container.textContent).not.toContain('Low balance');
    expect(container.textContent).not.toContain('Waiting for review');
  });
});
