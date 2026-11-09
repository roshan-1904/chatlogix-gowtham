import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../../pages/Dashboard';
import * as vendorsApi from '../vendors';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockSummary: vendorsApi.AdminDashboardSummary = {
  totalVendors: 42,
  approvedVendors: 35,
  pendingApproval: 4,
  orderRevenuePaiseMonth: 12500000, // ₹1,25,000.00
};

describe('Admin Dashboard Page', () => {
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

  const renderDashboard = async () => {
    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Dashboard />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  };

  it('renders Dashboard header and KPI summary cards', async () => {
    vi.spyOn(vendorsApi, 'getDashboardSummary').mockResolvedValue(mockSummary);

    await renderDashboard();

    expect(container?.textContent).toContain('Dashboard');
    expect(container?.textContent).toContain('Platform health, shop registration overview');

    // Shops KPI
    expect(container?.textContent).toContain('Shops');
    expect(container?.textContent).toContain('42');
    expect(container?.textContent).toContain('all shops');

    // Approved KPI
    expect(container?.textContent).toContain('Approved');
    expect(container?.textContent).toContain('35');

    // Order Revenue KPI (paise to rupees formatting)
    expect(container?.textContent).toContain('Order revenue');
    expect(container?.textContent).toContain('₹1,25,000.00');
    expect(container?.textContent).toContain('this month (IST)');

    // Waiting for decision KPI with link to pending approval
    expect(container?.textContent).toContain('Waiting');
    expect(container?.textContent).toContain('4');
    expect(container?.textContent).toContain('need decision');

    const waitingLink = container?.querySelector('a[href="/vendors?status=pending_approval"]');
    expect(waitingLink).toBeDefined();
  });

  it('renders loading state when summary is pending', async () => {
    vi.spyOn(vendorsApi, 'getDashboardSummary').mockReturnValue(new Promise(() => {}));

    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Dashboard />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(container?.textContent).toContain('Loading shop counts…');
  });

  it('renders error state when API fails', async () => {
    vi.spyOn(vendorsApi, 'getDashboardSummary').mockRejectedValue(new Error('Network offline'));

    await renderDashboard();

    expect(container?.textContent).toContain('Could not load shop counts.');
    expect(container?.textContent).toContain('Network offline');
  });
});

