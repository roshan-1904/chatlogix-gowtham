// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Usage } from '../../pages/Usage';
import { VendorUsage } from '../../pages/VendorUsage';
import * as usageApi from '../usage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockPlatformUsage: usageApi.PlatformUsageResponse = {
  from: '2026-10-18T00:00:00.000Z',
  to: '2026-10-24T23:59:59.999Z',
  totals: {
    chargedMilli: 12400000, // ₹12,400.00
    openAiCostMilli: 8100000, // ₹8,100.00
    trialGrantedMilli: 2500000, // ₹2,500.00
    otherCreditsMilli: 1000000,
    hasIncompleteCost: false,
  },
  bySource: [
    {
      source: 'conversation_turn',
      label: 'Customer replies',
      chargedMilli: 9200000,
      count: 4100,
    },
    {
      source: 'catalog_import',
      label: 'Catalog import',
      chargedMilli: 2100000,
      count: 30,
    },
    {
      source: 'outbound_media',
      label: 'Product media',
      chargedMilli: 1100000,
      count: 220,
    },
  ],
  byVendor: [
    {
      vendorId: 'vendor-1',
      businessName: 'Annapoorna Foods',
      chargedMilli: 840000, // ₹840.00
      count: 310,
      topSource: 'Customer replies',
    },
    {
      vendorId: 'vendor-2',
      businessName: 'Bakery Delights',
      chargedMilli: 420000, // ₹420.00
      count: 150,
      topSource: 'Product media',
    },
  ],
  pagination: {
    page: 1,
    limit: 25,
    totalVendors: 2,
    totalPages: 1,
  },
  meta: {
    conversationCount: 840,
    chargedToVendorsForMetaMilli: 0,
  },
};

const mockVendorUsage: usageApi.VendorUsageResponse = {
  vendorId: 'vendor-1',
  businessName: 'Annapoorna Foods',
  from: '2026-10-18T00:00:00.000Z',
  to: '2026-10-24T23:59:59.999Z',
  totals: {
    chargedMilli: 840000, // ₹840.00
    openAiCostMilli: 560000, // ₹560.00
    hasIncompleteCost: false,
  },
  bySource: [
    {
      source: 'conversation_turn',
      label: 'Customer replies',
      chargedMilli: 790000,
      count: 290,
    },
    {
      source: 'outbound_media',
      label: 'Product media',
      chargedMilli: 50000,
      count: 20,
    },
  ],
  byDay: [
    {
      day: '2026-10-21',
      chargedMilli: 440000,
      count: 160,
    },
    {
      day: '2026-10-20',
      chargedMilli: 400000,
      count: 150,
    },
  ],
  selectedDay: '2026-10-21',
  charges: [
    {
      id: 'charge-1',
      time: '2026-10-21T04:44:00.000Z',
      source: 'conversation_turn',
      sourceLabel: 'Customer replies',
      chargedMilli: 390, // ₹0.39
      openAiCostMilli: 260, // ₹0.26
    },
    {
      id: 'charge-2',
      time: '2026-10-21T03:30:00.000Z',
      source: 'outbound_media',
      sourceLabel: 'Product media',
      chargedMilli: 50, // ₹0.05
      openAiCostMilli: 0,
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

describe('Usage Pages Frontend Integration', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const renderUsage = async (initialEntries = ['/usage']) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={initialEntries}>
            <Routes>
              <Route path="/usage" element={<Usage />} />
              <Route path="/usage/:vendorId" element={<VendorUsage />} />
              <Route path="/billing" element={<div>Billing Settings Page</div>} />
              <Route path="/vendors/:vendorId" element={<div>Vendor Detail Page</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    // Allow queries to resolve and components to re-render
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  };

  describe('Platform Usage Page (/usage)', () => {
    it('renders header, title, and platform description', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue(mockPlatformUsage);
      await renderUsage();

      expect(container.querySelector('h1')?.textContent).toContain('Usage');
      expect(container.textContent).toContain(
        'Wallet charges and what they cost us. Amounts are in rupees.'
      );
    });

    it('renders all four platform KPI cards with correct amounts', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue(mockPlatformUsage);
      await renderUsage();

      // Charged to shops
      expect(container.textContent).toContain('Charged to shops');
      expect(container.textContent).toContain('₹12,400.00');
      expect(container.textContent).toContain('billed to shops');

      // OpenAI cost
      expect(container.textContent).toContain('OpenAI cost');
      expect(container.textContent).toContain('₹8,100.00');
      expect(container.textContent).toContain('our AI provider cost');

      // Margin % card: ((12400000 - 8100000) / 12400000) * 100 = 34.677% -> 34.7%
      expect(container.textContent).toContain('Margin %');
      expect(container.textContent).toContain('34.7%');
      expect(container.textContent).toContain('billed vs AI provider cost');

      // Trial credit granted
      expect(container.textContent).toContain('Trial credit granted');
      expect(container.textContent).toContain('₹2,500.00');
      expect(container.textContent).toContain('onboarding grants');
    });

    it('renders Meta absorbed cost card with conversation count and explicit absorbed caveat', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue(mockPlatformUsage);
      await renderUsage();

      expect(container.textContent).toContain('Meta cost we absorb');
      expect(container.textContent).toContain('840 conversations in this range.');
      expect(container.textContent).toContain('Charged to shops for Meta: ₹0.00');
      expect(container.textContent).toContain(
        "Meta's own bill is not stored. ChatLogix absorbs it."
      );
    });

    it('displays zero conversations message when Meta volume is 0', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue({
        ...mockPlatformUsage,
        meta: { conversationCount: 0, chargedToVendorsForMetaMilli: 0 },
      });
      await renderUsage();

      expect(container.textContent).toContain('No conversations started in this range.');
    });

    it('renders source breakdown table with human-readable staff labels', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue(mockPlatformUsage);
      await renderUsage();

      const sourceTable = container.querySelector('table');
      expect(sourceTable).not.toBeNull();
      expect(container.textContent).toContain('Customer replies');
      expect(container.textContent).toContain('₹9,200.00');
      expect(container.textContent).toContain('4,100');

      expect(container.textContent).toContain('Catalog import');
      expect(container.textContent).toContain('₹2,100.00');
      expect(container.textContent).toContain('30');

      expect(container.textContent).toContain('Product media');
      expect(container.textContent).toContain('₹1,100.00');
      expect(container.textContent).toContain('220');
    });

    it('renders shops table with links to shop usage drill-down', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue(mockPlatformUsage);
      await renderUsage();

      const annapoornaLink = container.querySelector('a[href*="/usage/vendor-1"]');
      expect(annapoornaLink).not.toBeNull();
      expect(annapoornaLink?.textContent).toContain('Annapoorna Foods');

      const bakeryLink = container.querySelector('a[href*="/usage/vendor-2"]');
      expect(bakeryLink).not.toBeNull();
      expect(bakeryLink?.textContent).toContain('Bakery Delights');

      expect(container.textContent).toContain('sort: Charged ↓');
    });

    it('renders link to Billing settings in footer', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue(mockPlatformUsage);
      await renderUsage();

      const billingLink = container.querySelector('a[href="/billing"]');
      expect(billingLink).not.toBeNull();
      expect(billingLink?.textContent).toContain('→ /billing');
      expect(container.textContent).toContain('Edit fees, trial grant, and the exchange rate.');
    });

    it('shows loading state while fetching platform usage', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockReturnValue(new Promise(() => {}));
      await renderUsage();

      expect(container.textContent).toContain('Loading usage…');
    });

    it('shows error state with retry button when fetch fails', async () => {
      const getSpy = vi
        .spyOn(usageApi, 'getPlatformUsage')
        .mockRejectedValue(new Error('Network error on admin usage'));
      await renderUsage();

      expect(container.textContent).toContain('Could not load usage.');
      expect(container.textContent).toContain('Network error on admin usage');

      const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Retry')
      );
      expect(retryBtn).toBeDefined();

      getSpy.mockResolvedValueOnce(mockPlatformUsage);
      await act(async () => {
        retryBtn?.click();
      });
    });

    it('shows empty state banner when no charges occurred in range', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue({
        ...mockPlatformUsage,
        totals: {
          chargedMilli: 0,
          openAiCostMilli: 0,
          trialGrantedMilli: 0,
          otherCreditsMilli: 0,
        },
        bySource: [],
        byVendor: [],
      });
      await renderUsage();

      expect(container.textContent).toContain('No charges in this range.');
      expect(container.textContent).toContain('No source breakdown available for this range.');
      expect(container.textContent).toContain('No shops with charges in this range.');
    });

    it('handles incomplete cost data safely without showing fabricated amounts or NaN', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue({
        ...mockPlatformUsage,
        totals: {
          ...mockPlatformUsage.totals,
          openAiCostMilli: null,
          hasIncompleteCost: true,
        },
      });
      await renderUsage();

      expect(container.textContent).toContain('OpenAI cost');
      expect(container.textContent).toContain('—');
      expect(container.textContent).toContain('Incomplete AI cost data');
    });

    it('validates custom date range inputs and prevents queries exceeding 31 days', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue(mockPlatformUsage);
      await renderUsage();

      const fromInput = container.querySelector('#usage-from-date') as HTMLInputElement;
      const toInput = container.querySelector('#usage-to-date') as HTMLInputElement;
      const applyBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Apply'
      );

      expect(fromInput).not.toBeNull();
      expect(toInput).not.toBeNull();

      // Enter 45 days span
      await act(async () => {
        changeInputValue(fromInput, '2026-09-01');
        changeInputValue(toInput, '2026-10-15');
      });

      expect(container.textContent).toContain('Date range cannot exceed 31 calendar days.');
      expect(applyBtn?.hasAttribute('disabled')).toBe(true);
    });

    it('triggers CSV download when Export CSV button is clicked', async () => {
      vi.spyOn(usageApi, 'getPlatformUsage').mockResolvedValue(mockPlatformUsage);
      const exportSpy = vi.spyOn(usageApi, 'exportPlatformUsageCsv').mockResolvedValue({
        filename: 'chatlogix-usage-2026-10-18-to-2026-10-24.csv',
        blob: new Blob(['test']),
      });
      const downloadSpy = vi.spyOn(usageApi, 'triggerBlobDownload').mockImplementation(() => {});

      await renderUsage();

      const exportBtn = container.querySelector('#export-usage-csv-btn') as HTMLButtonElement;
      expect(exportBtn).not.toBeNull();

      await act(async () => {
        exportBtn.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(exportSpy).toHaveBeenCalled();
      expect(downloadSpy).toHaveBeenCalledWith(
        expect.any(Blob),
        'chatlogix-usage-2026-10-18-to-2026-10-24.csv'
      );
    });
  });

  describe('Shop Usage Drill-down Page (/usage/:vendorId)', () => {
    it('renders back navigation to all shops preserving active date range', async () => {
      vi.spyOn(usageApi, 'getVendorUsage').mockResolvedValue(mockVendorUsage);
      await renderUsage(['/usage/vendor-1?from=2026-10-18&to=2026-10-24']);

      const backLink = container.querySelector('a[href*="/usage?from=2026-10-18&to=2026-10-24"]');
      expect(backLink).not.toBeNull();
      expect(backLink?.textContent).toContain('All shops');
    });

    it('renders shop business name and deep-link to vendor wallet in Vendors', async () => {
      vi.spyOn(usageApi, 'getVendorUsage').mockResolvedValue(mockVendorUsage);
      await renderUsage(['/usage/vendor-1']);

      expect(container.querySelector('h1')?.textContent).toContain('Annapoorna Foods');
      expect(container.textContent).toContain('vendor-1');

      const vendorLink = container.querySelector('a[href*="/vendors/vendor-1#wallet"]');
      expect(vendorLink).not.toBeNull();
      expect(vendorLink?.textContent).toContain('View in Vendors');
    });

    it('renders vendor KPI cards (Charged and OpenAI cost before markup)', async () => {
      vi.spyOn(usageApi, 'getVendorUsage').mockResolvedValue(mockVendorUsage);
      await renderUsage(['/usage/vendor-1']);

      expect(container.textContent).toContain('Charged');
      expect(container.textContent).toContain('₹840.00');
      expect(container.textContent).toContain('total wallet charges');

      expect(container.textContent).toContain('OpenAI cost');
      expect(container.textContent).toContain('₹560.00');
      expect(container.textContent).toContain('before markup');
    });

    it('renders By source and By day tables', async () => {
      vi.spyOn(usageApi, 'getVendorUsage').mockResolvedValue(mockVendorUsage);
      await renderUsage(['/usage/vendor-1']);

      // Source table
      expect(container.textContent).toContain('By source');
      expect(container.textContent).toContain('Customer replies');
      expect(container.textContent).toContain('₹790.00');

      // Day table
      expect(container.textContent).toContain('By day');
      expect(container.textContent).toContain('21 Oct 2026');
      expect(container.textContent).toContain('20 Oct 2026');
      expect(container.textContent).toContain('Selected');
    });

    it('renders charges inspector table on selected day with maximum 100 rows', async () => {
      vi.spyOn(usageApi, 'getVendorUsage').mockResolvedValue(mockVendorUsage);
      await renderUsage(['/usage/vendor-1']);

      expect(container.textContent).toContain('Charges on 21 Oct 2026');
      expect(container.textContent).toContain('(max 100)');

      // First charge
      expect(container.textContent).toContain('Customer replies');
      expect(container.textContent).toContain('₹0.39');
      expect(container.textContent).toContain('₹0.26');

      // Second charge
      expect(container.textContent).toContain('Product media');
      expect(container.textContent).toContain('₹0.05');
    });

    it('renders missing shop (404) state when vendor does not exist', async () => {
      vi.spyOn(usageApi, 'getVendorUsage').mockRejectedValue(new Error('404: not_found'));
      await renderUsage(['/usage/non-existent-vendor']);

      expect(container.textContent).toContain('No shop has that id.');
      expect(container.textContent).toContain('The requested vendor could not be found');

      const backToUsageLink = container.querySelector('a[href="/usage"]');
      expect(backToUsageLink).not.toBeNull();
      expect(backToUsageLink?.textContent).toContain('Back to Usage');
    });
  });
});
