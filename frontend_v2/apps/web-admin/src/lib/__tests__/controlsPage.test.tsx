import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Controls } from '../../pages/Controls';
import { ShopInspection } from '../../pages/ShopInspection';
import * as controlsApi from '../controls';
import * as vendorsApi from '../vendors';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockAuditLogs: controlsApi.StaffAuditLogEntry[] = [
  {
    id: 'audit-1',
    actorId: 'admin-gowtham',
    action: 'wallet_credited',
    vendorId: 'vendor-sri-krishna',
    summary: 'Credited wallet with ₹500.00 (manual recharge)',
    metadata: { amountMilli: 500000, referenceId: 'topup-ref-1' },
    createdAt: '2026-11-09T10:00:00Z',
  },
  {
    id: 'audit-2',
    actorId: 'admin-gowtham',
    action: 'markup_changed',
    vendorId: 'vendor-sri-krishna',
    summary: 'Updated vendor markup from 40% to 50%',
    metadata: { previousMarkup: 40, newMarkup: 50 },
    createdAt: '2026-11-09T09:30:00Z',
  },
  {
    id: 'audit-3',
    actorId: 'admin-saravanan',
    action: 'conversation_read',
    vendorId: 'vendor-annapoorna',
    summary: 'Loaded conversation transcript conv-99 under staff audit',
    metadata: { conversationId: 'conv-99' },
    createdAt: '2026-11-09T08:15:00Z',
  },
];

const mockComputedAlerts: controlsApi.ComputedAlert[] = [
  {
    id: 'low_wallet-vendor-sri-krishna',
    type: 'low_wallet',
    severity: 'warning',
    vendorId: 'vendor-sri-krishna',
    businessName: 'Sri Krishna Sweets',
    summary: 'Balance is ₹12.40 (evaluated now)',
    targetLink: '/vendors',
    evaluatedAt: '2026-11-09T10:30:00Z',
  },
  {
    id: 'failing_replies-vendor-annapoorna',
    type: 'failing_replies',
    severity: 'error',
    vendorId: 'vendor-annapoorna',
    businessName: 'Annapoorna Foods',
    summary: '4 failed replies in the last 24 hours',
    targetLink: '/reliability?queue=failed',
    evaluatedAt: '2026-11-09T10:30:00Z',
  },
];

const mockTrialClocks: controlsApi.TrialClockRow[] = [
  {
    vendorId: 'vendor-trial-1',
    businessName: 'Chennai Tiffin House',
    registrationStatus: 'pending_approval',
    trialGrantedMilli: 100000,
    walletBalanceMilli: 45000,
    trialExpiresAt: '2026-11-14T00:00:00Z',
    isPastExpiry: false,
    caption: 'Expires in 5 days. 100 replies remaining.',
  },
  {
    vendorId: 'vendor-trial-2',
    businessName: 'Madurai Dosa Corner',
    registrationStatus: 'rejected',
    trialGrantedMilli: 50000,
    walletBalanceMilli: 0,
    trialExpiresAt: '2026-11-01T00:00:00Z',
    isPastExpiry: true,
    caption: 'Trial expired on 1 Nov 2026.',
  },
];

describe('Controls & Shop Inspection Page Integration', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(controlsApi, 'listAuditLogs').mockResolvedValue({
      items: mockAuditLogs,
      count: mockAuditLogs.length,
      status: 'ready',
      supported: true,
    });

    vi.spyOn(controlsApi, 'getComputedAlerts').mockResolvedValue({
      alerts: mockComputedAlerts,
      count: mockComputedAlerts.length,
      evaluatedAt: '2026-11-09T10:30:00Z',
    });

    vi.spyOn(controlsApi, 'getTrialClocks').mockResolvedValue({
      items: mockTrialClocks,
      count: mockTrialClocks.length,
      filter: 'next7',
    });

    vi.spyOn(controlsApi, 'recordStaffAudit').mockResolvedValue({
      recorded: true,
    });

    vi.spyOn(vendorsApi, 'getVendorConfig').mockResolvedValue({
      id: 'vendor-sri-krishna',
      businessName: 'Sri Krishna Sweets',
      plan: 'pro',
      status: 'active',
      walletBalanceMilli: 12400,
      markupPercent: 50,
      paymentFeeBps: 200,
      paymentsManagedByChatlogix: true,
      paymentLinkAutoSend: true,
      category: 'sweets',
      catalogImportEnabled: true,
      ai: {},
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    queryClient.clear();
  });

  const renderComponent = async (initialPath = '/controls') => {
    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/controls" element={<Controls />} />
              <Route path="/controls/:tab" element={<Controls />} />
              <Route path="/vendors/:vendorId/shop" element={<ShopInspection />} />
              <Route path="/vendors/:vendorId" element={<div>Vendor Detail Page</div>} />
              <Route path="/vendors" element={<div>Vendors Page</div>} />
              <Route path="/reliability" element={<div>Reliability Page</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Wait for queries to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  };

  it('renders Controls header and default Staff Audit Log tab', async () => {
    await renderComponent('/controls');

    expect(container?.textContent).toContain('Platform Controls');
    expect(container?.textContent).toContain('Staff Audit Log');
    expect(container?.textContent).toContain('Computed Alerts');
    expect(container?.textContent).toContain('Trial Clocks');

    // Default tab is audit log
    expect(container?.textContent).toContain('admin-gowtham');
    expect(container?.textContent).toContain('Credited wallet with ₹500.00');
    expect(container?.textContent).toContain('Wallet Credited');
    expect(container?.textContent).toContain('Markup Changed');
  });

  it('toggles metadata inspection in Audit Log table', async () => {
    await renderComponent('/controls?tab=audit');

    const inspectButtons = container?.querySelectorAll('button') || [];
    const inspectBtn = Array.from(inspectButtons).find((btn) => btn.textContent === 'Inspect');
    expect(inspectBtn).toBeDefined();

    await act(async () => {
      inspectBtn?.click();
    });

    expect(container?.textContent).toContain('topup-ref-1');
    expect(container?.textContent).toContain('500000');
    expect(inspectBtn?.textContent).toBe('Hide');

    await act(async () => {
      inspectBtn?.click();
    });

    expect(inspectBtn?.textContent).toBe('Inspect');
  });

  it('filters audit log when an action filter is selected', async () => {
    await renderComponent('/controls?tab=audit');

    const select = container?.querySelector('select') as HTMLSelectElement;
    expect(select).toBeDefined();

    await act(async () => {
      select.value = 'wallet_credited';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for refetch query
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(controlsApi.listAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'wallet_credited' })
    );
  });

  it('renders Computed Alerts tab with alert cards and count badge', async () => {
    await renderComponent('/controls?tab=alerts');

    expect(container?.textContent).toContain('Phase 1: Real-Time Evaluated Alerts');
    expect(container?.textContent).toContain('Sri Krishna Sweets');
    expect(container?.textContent).toContain('Balance is ₹12.40 (evaluated now)');
    expect(container?.textContent).toContain('Annapoorna Foods');
    expect(container?.textContent).toContain('4 failed replies in the last 24 hours');

    const investigateLinks = container?.querySelectorAll('a');
    const investLink = Array.from(investigateLinks || []).find((a) =>
      a.textContent?.includes('Investigate')
    );
    expect(investLink).toBeDefined();
  });

  it('refetches alerts when "Re-evaluate Now" is clicked', async () => {
    await renderComponent('/controls?tab=alerts');

    const reevalBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Re-evaluate Now')
    );
    expect(reevalBtn).toBeDefined();

    await act(async () => {
      reevalBtn?.click();
    });

    expect(controlsApi.getComputedAlerts).toHaveBeenCalled();
  });

  it('renders Trial Clocks tab with filter buttons and trial table', async () => {
    await renderComponent('/controls?tab=trials');

    expect(container?.textContent).toContain('Filter Window:');
    expect(container?.textContent).toContain('Chennai Tiffin House');
    expect(container?.textContent).toContain('Madurai Dosa Corner');
    expect(container?.textContent).toContain('₹100.00'); // Trial grant
    expect(container?.textContent).toContain('₹45.00'); // Balance
    expect(container?.textContent).toContain('Expires in 5 days');

    const pastExpiryBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Past Expiry')
    );
    expect(pastExpiryBtn).toBeDefined();

    await act(async () => {
      pastExpiryBtn?.click();
    });

    expect(controlsApi.getTrialClocks).toHaveBeenCalledWith('past');
  });

  it('renders Shop Inspection page and auto-records staff audit', async () => {
    await renderComponent('/vendors/vendor-sri-krishna/shop');

    expect(container?.textContent).toContain('Read-only Inspection Mode');
    expect(container?.textContent).toContain('Sri Krishna Sweets');

    expect(controlsApi.recordStaffAudit).toHaveBeenCalledWith(
      'shop_viewed',
      'vendor-sri-krishna',
      expect.stringContaining('Staff inspected catalog tab for vendor Sri Krishna Sweets'),
      { tab: 'catalog' }
    );
  });
  it('renders Export CSV button and triggers exportAuditLogsCsv on click', async () => {
    const exportSpy = vi.spyOn(controlsApi, 'exportAuditLogsCsv').mockImplementation(() => {});

    await renderComponent('/controls?tab=audit');

    const exportBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Export CSV')
    );
    expect(exportBtn).toBeDefined();

    await act(async () => {
      exportBtn?.click();
    });

    expect(exportSpy).toHaveBeenCalledWith(mockAuditLogs);
    exportSpy.mockRestore();
  });

  it('renders tabs directly via route path param /controls/alerts', async () => {
    await renderComponent('/controls/alerts');
    expect(container?.textContent).toContain('Phase 1: Real-Time Evaluated Alerts');
    expect(container?.textContent).toContain('Sri Krishna Sweets');
  });

  it('renders tabs directly via route path param /controls/trials', async () => {
    await renderComponent('/controls/trials');
    expect(container?.textContent).toContain('Filter Window:');
    expect(container?.textContent).toContain('Chennai Tiffin House');
  });

  it('deep-links vendor references to /vendors/:vendorId in audit log', async () => {
    await renderComponent('/controls?tab=audit');
    const auditVendorLink = container?.querySelector('a[href="/vendors/vendor-sri-krishna"]');
    expect(auditVendorLink).not.toBeNull();
    expect(auditVendorLink?.getAttribute('href')).toBe('/vendors/vendor-sri-krishna');
  });

  it('deep-links vendor references to /vendors/:vendorId in trial clocks', async () => {
    await renderComponent('/controls?tab=trials');
    const trialVendorLink = container?.querySelector('a[href="/vendors/vendor-trial-1"]');
    expect(trialVendorLink).not.toBeNull();
    expect(trialVendorLink?.getAttribute('href')).toBe('/vendors/vendor-trial-1');
    expect(trialVendorLink?.textContent).toContain('Chennai Tiffin House');
  });

  it('deep-links back navigation in Shop Inspection to /vendors/:vendorId', async () => {
    await renderComponent('/vendors/vendor-sri-krishna/shop');
    const backLink = container?.querySelector('a[href="/vendors/vendor-sri-krishna"]');
    expect(backLink).not.toBeNull();
    expect(backLink?.getAttribute('href')).toBe('/vendors/vendor-sri-krishna');
    expect(backLink?.textContent).toContain('Back to Shop');
  });
});