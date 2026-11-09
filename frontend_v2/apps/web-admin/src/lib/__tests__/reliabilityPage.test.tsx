import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation, useNavigate, type Location } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Reliability } from '../../pages/Reliability';
import * as reliabilityApi from '../reliability';

const mockApiErrorStats: reliabilityApi.ApiErrorStats = {
  totalErrors: 14,
  currentErrorRate: 0.25,
  uptime: 7200,
  errorCounts: {
    VALIDATION_ERROR: 10,
    NOT_FOUND: 4,
  },
  timestamp: '2026-11-09T10:00:00Z',
};

const mockFailedMessages: reliabilityApi.FailedMessage[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-101',
    timestamp: '2026-11-09T09:30:00Z',
    vendorId: 'vendor-1',
    businessName: 'Annapoorna Foods',
    customerPhone: '+919876543210',
    content: 'Your order is confirmed.',
    failureReason: 'WhatsApp Graph 500 error',
    senderType: 'assistant',
  },
  {
    id: 'msg-special',
    conversationId: 'conv-102',
    timestamp: '2026-11-09T09:45:00Z',
    vendorId: 'vendor/special#123',
    businessName: 'Special Spice Mart',
    customerPhone: '+919123456789',
    content: 'Special promo details',
    failureReason: 'Meta rate limit',
    senderType: 'assistant',
  },
];

const mockPausedConversations: reliabilityApi.PausedConversation[] = [
  {
    id: 'conv-p1',
    vendorId: 'vendor-2',
    businessName: 'Bakery Delights',
    customerId: 'cust-2',
    customerPhone: '+919876543222',
    updatedAt: '2026-11-09T08:00:00Z',
    hint: 'Assistant will not reply until the vendor resumes.',
  },
  {
    id: 'conv-p2',
    vendorId: 'vendor/special#123',
    businessName: 'Special Spice Mart',
    customerId: 'cust-sp',
    customerPhone: '+919876543333',
    updatedAt: '2026-11-09T08:15:00Z',
    hint: 'Assistant will not reply until the vendor resumes.',
  },
];

const mockWalletBlocksPending: reliabilityApi.WalletBlocksResponse = {
  supported: false,
  status: 'pending_migration',
  message: 'WalletBlockEvent persistence requires schema migration (Decision 2 Option A).',
  from: '2026-11-08T10:00:00Z',
  to: '2026-11-09T10:00:00Z',
  items: [],
  count: 0,
};

const mockStuckOrders: reliabilityApi.StuckOrder[] = [
  {
    id: 'order-1',
    orderNumber: 'ORD-901',
    vendorId: 'vendor-3',
    businessName: 'Spice Junction',
    customerPhone: '+919876543333',
    status: 'pending',
    totalAmountPaise: 45000,
    updatedAt: '2026-11-07T10:00:00Z',
  },
  {
    id: 'order-sp',
    orderNumber: 'ORD-SP',
    vendorId: 'vendor/special#123',
    businessName: 'Special Spice Mart',
    customerPhone: '+919876543444',
    status: 'confirmed',
    totalAmountPaise: 12500,
    updatedAt: '2026-11-07T12:00:00Z',
  },
];

const mockOrderAlerts: reliabilityApi.OrderAlert[] = [
  {
    id: 'alert-1',
    orderId: 'order-1',
    orderNumber: 'ORD-901',
    vendorId: 'vendor-3',
    businessName: 'Spice Junction',
    customerPhone: '+919876543333',
    severity: 'high',
    type: 'delivery_delay',
    message: 'Order delayed beyond SLA threshold',
    resolved: false,
    createdAt: '2026-11-08T12:00:00Z',
  },
];

vi.mock('../reliability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../reliability')>();
  return {
    ...actual,
    getApiErrorStats: vi.fn(),
    getFailedMessages: vi.fn(),
    getPausedConversations: vi.fn(),
    getWalletBlocks: vi.fn(),
    getStuckOrders: vi.fn(),
    getOrderAlerts: vi.fn(),
  };
});

describe('Reliability Page Frontend Integration', () => {
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

    vi.mocked(reliabilityApi.getApiErrorStats).mockResolvedValue(mockApiErrorStats);
    vi.mocked(reliabilityApi.getFailedMessages).mockResolvedValue({
      from: '2026-11-08T10:00:00Z',
      to: '2026-11-09T10:00:00Z',
      count: mockFailedMessages.length,
      items: mockFailedMessages,
    });
    vi.mocked(reliabilityApi.getPausedConversations).mockResolvedValue({
      count: mockPausedConversations.length,
      items: mockPausedConversations,
    });
    vi.mocked(reliabilityApi.getWalletBlocks).mockResolvedValue(mockWalletBlocksPending);
    vi.mocked(reliabilityApi.getStuckOrders).mockResolvedValue({
      cutoff: '2026-11-08T10:00:00Z',
      count: mockStuckOrders.length,
      items: mockStuckOrders,
    });
    vi.mocked(reliabilityApi.getOrderAlerts).mockResolvedValue({
      count: mockOrderAlerts.length,
      items: mockOrderAlerts,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  let testNavigator: {
    goBack: () => void;
    goForward: () => void;
    getLocation: () => Location;
  };

  function RouterTestSpy() {
    const navigate = useNavigate();
    const location = useLocation();
    testNavigator = {
      goBack: () => navigate(-1),
      goForward: () => navigate(1),
      getLocation: () => location,
    };
    return null;
  }

  async function renderWithRouter(initialEntry: string) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <RouterTestSpy />
            <Routes>
              <Route path="/reliability" element={<Reliability />} />
              <Route path="/reliability/:queue" element={<Reliability />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Wait for React Query to resolve and render DOM updates
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
  }

  // ==========================================
  // 1. Reliability Page Rendering Across Tabs
  // ==========================================
  describe('Queue Tabs Rendering', () => {
    it('renders Failed Replies queue by default when no queue param is provided', async () => {
      await renderWithRouter('/reliability');

      expect(container.textContent).toContain('Failed Assistant Replies');
      expect(container.textContent).toContain('Annapoorna Foods');
      expect(container.textContent).toContain('WhatsApp Graph 500 error');
      expect(container.textContent).toContain('+919876543210');
    });

    it('renders Paused AI queue when queue=paused', async () => {
      await renderWithRouter('/reliability?queue=paused');

      expect(container.textContent).toContain('Paused AI Conversations');
      expect(container.textContent).toContain('Bakery Delights');
      expect(container.textContent).toContain('+919876543222');
      expect(container.textContent).toContain('Assistant will not reply until the vendor resumes.');
    });

    it('renders Wallet Blocks queue when queue=wallet', async () => {
      await renderWithRouter('/reliability?queue=wallet');

      expect(container.textContent).toContain('Wallet-Blocked Turns');
      expect(container.textContent).toContain('WalletBlockEvent Persistence Pending Schema Migration (Decision 2 Option A)');
      expect(container.textContent).toContain('No persisted block events in this range (pending table migration).');
    });

    it('renders Stuck Orders & Alerts queue when queue=orders', async () => {
      await renderWithRouter('/reliability?queue=orders');

      expect(container.textContent).toContain('Stuck Pending Orders (>24 Hours)');
      expect(container.textContent).toContain('ORD-901');
      expect(container.textContent).toContain('Spice Junction');
      expect(container.textContent).toContain('₹450.00');
      expect(container.textContent).toContain('Open Order Alerts');
      expect(container.textContent).toContain('Order delayed beyond SLA threshold');
    });
  });

  // ==========================================
  // 2. URL Synchronization
  // ==========================================
  describe('URL Synchronization & Filters', () => {
    it('safely falls back to failed tab when an invalid queue param is in the URL', async () => {
      await renderWithRouter('/reliability?queue=invalid_queue_param');

      expect(container.textContent).toContain('Failed Assistant Replies');
      expect(container.textContent).toContain('Annapoorna Foods');
    });

    it('initializes vendor search filter from URL vendorId param', async () => {
      await renderWithRouter('/reliability?queue=failed&vendorId=vendor-1');

      const input = container.querySelector<HTMLInputElement>('#vendorSearch');
      expect(input?.value).toBe('vendor-1');

      expect(reliabilityApi.getFailedMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorId: 'vendor-1',
        })
      );
    });

    it('reads custom from and to date params from URL and queries with them', async () => {
      const from = '2026-11-01T00:00:00.000Z';
      const to = '2026-11-08T00:00:00.000Z';
      await renderWithRouter(`/reliability?queue=failed&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

      expect(reliabilityApi.getFailedMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          from,
          to,
        })
      );
    });

    it('switches queue tab when another tab button is clicked', async () => {
      await renderWithRouter('/reliability?queue=failed');

      expect(container.textContent).toContain('Failed Assistant Replies');

      const pausedTabButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Paused AI')
      );
      expect(pausedTabButton).toBeDefined();

      await act(async () => {
        pausedTabButton?.click();
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(container.textContent).toContain('Paused AI Conversations');
      expect(container.textContent).toContain('Bakery Delights');
    });

    it('restores previous and next queues on browser back and forward navigation', async () => {
      // 1. Start on Failed Replies
      await renderWithRouter('/reliability?queue=failed');
      expect(testNavigator.getLocation().search).toBe('?queue=failed');
      expect(container.textContent).toContain('Failed Assistant Replies');

      // 2. Navigate to Paused AI
      const pausedTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Paused AI')
      );
      expect(pausedTabBtn).toBeDefined();
      await act(async () => {
        pausedTabBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(testNavigator.getLocation().search).toBe('?queue=paused');
      expect(container.textContent).toContain('Paused AI Conversations');

      // 3. Navigate to Wallet Blocks
      const walletTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Wallet blocks')
      );
      expect(walletTabBtn).toBeDefined();
      await act(async () => {
        walletTabBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(testNavigator.getLocation().search).toBe('?queue=wallet');
      expect(container.textContent).toContain('Wallet-Blocked Turns');

      // 4. Simulate Browser Back -> Should restore Paused AI
      await act(async () => {
        testNavigator.goBack();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(testNavigator.getLocation().search).toBe('?queue=paused');
      expect(container.textContent).toContain('Paused AI Conversations');

      // 5. Simulate Browser Back again -> Should restore Failed Replies
      await act(async () => {
        testNavigator.goBack();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(testNavigator.getLocation().search).toBe('?queue=failed');
      expect(container.textContent).toContain('Failed Assistant Replies');

      // 6. Simulate Browser Forward -> Should restore Paused AI
      await act(async () => {
        testNavigator.goForward();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(testNavigator.getLocation().search).toBe('?queue=paused');
      expect(container.textContent).toContain('Paused AI Conversations');

      // 7. Simulate Browser Forward again -> Should restore Wallet Blocks
      await act(async () => {
        testNavigator.goForward();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(testNavigator.getLocation().search).toBe('?queue=wallet');
      expect(container.textContent).toContain('Wallet-Blocked Turns');
    });

    it('updates vendorId in the URL, removes it when cleared, and preserves unrelated parameters', async () => {
      // Start with unrelated query parameter
      await renderWithRouter('/reliability?queue=failed&theme=dark');

      const input = container.querySelector<HTMLInputElement>('#vendorSearch');
      expect(input).toBeDefined();

      // Change the vendor filter input
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(input, 'vendor-abc');
        input?.dispatchEvent(new Event('input', { bubbles: true }));
        input?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const paramsWithVendor = new URLSearchParams(testNavigator.getLocation().search);
      expect(paramsWithVendor.get('vendorId')).toBe('vendor-abc');
      expect(paramsWithVendor.get('queue')).toBe('failed');
      expect(paramsWithVendor.get('theme')).toBe('dark'); // Unrelated param preserved

      // Clear the filter
      const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim() === 'Clear'
      );
      expect(clearBtn).toBeDefined();

      await act(async () => {
        clearBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const paramsAfterClear = new URLSearchParams(testNavigator.getLocation().search);
      expect(paramsAfterClear.has('vendorId')).toBe(false);
      expect(paramsAfterClear.get('queue')).toBe('failed');
      expect(paramsAfterClear.get('theme')).toBe('dark'); // Unrelated param preserved
    });

    it('updates from and to date params in URL when selecting range presets and preserves unrelated parameters', async () => {
      // Start with queue and an unrelated parameter
      await renderWithRouter('/reliability?queue=failed&tenant=acme');

      // 1. Select Last 7d
      const last7dBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim() === 'Last 7d'
      );
      expect(last7dBtn).toBeDefined();

      await act(async () => {
        last7dBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const params7d = new URLSearchParams(testNavigator.getLocation().search);
      expect(params7d.has('from')).toBe(true);
      expect(params7d.has('to')).toBe(true);
      expect(params7d.get('tenant')).toBe('acme'); // Unrelated param preserved
      expect(params7d.get('queue')).toBe('failed');

      const from7dTime = new Date(params7d.get('from')!).getTime();
      const to7dTime = new Date(params7d.get('to')!).getTime();
      const diffHours7d = (to7dTime - from7dTime) / (3600 * 1000);
      expect(diffHours7d).toBeGreaterThanOrEqual(24 * 6.5);
      expect(diffHours7d).toBeLessThanOrEqual(24 * 7.5);

      // 2. Select Last 30d
      const last30dBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim() === 'Last 30d'
      );
      expect(last30dBtn).toBeDefined();

      await act(async () => {
        last30dBtn?.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      const params30d = new URLSearchParams(testNavigator.getLocation().search);
      expect(params30d.has('from')).toBe(true);
      expect(params30d.has('to')).toBe(true);
      expect(params30d.get('tenant')).toBe('acme'); // Unrelated param preserved
      expect(params30d.get('queue')).toBe('failed');

      const from30dTime = new Date(params30d.get('from')!).getTime();
      const to30dTime = new Date(params30d.get('to')!).getTime();
      const diffHours30d = (to30dTime - from30dTime) / (3600 * 1000);
      expect(diffHours30d).toBeGreaterThanOrEqual(24 * 29);
      expect(diffHours30d).toBeLessThanOrEqual(24 * 31);
    });
  });

  // ==========================================
  // 3. Deep Links Verification
  // ==========================================
  describe('Deep Links Alignment', () => {
    it('renders correct Open Shop link (/vendors/:vendorId) for Failed Replies', async () => {
      await renderWithRouter('/reliability?queue=failed');

      const openShopLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).filter(
        (a) => a.textContent?.trim() === 'Open shop'
      );

      expect(openShopLinks.length).toBe(2);
      expect(openShopLinks[0].getAttribute('href')).toBe('/vendors/vendor-1');
      // Special characters safely encoded
      expect(openShopLinks[1].getAttribute('href')).toBe('/vendors/vendor%2Fspecial%23123');
    });

    it('renders correct Open Case link with vendorId and conversationId for Failed Replies', async () => {
      await renderWithRouter('/reliability?queue=failed');

      const openCaseLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).filter(
        (a) => a.textContent?.trim() === 'Open case'
      );

      expect(openCaseLinks.length).toBe(2);
      expect(openCaseLinks[0].getAttribute('href')).toBe(
        '/support/new?vendorId=vendor-1&conversationId=conv-101'
      );
      expect(openCaseLinks[1].getAttribute('href')).toBe(
        '/support/new?vendorId=vendor%2Fspecial%23123&conversationId=conv-102'
      );
    });

    it('renders correct Open Shop link (/vendors/:vendorId) for Paused AI', async () => {
      await renderWithRouter('/reliability?queue=paused');

      const openShopLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).filter(
        (a) => a.textContent?.trim() === 'Open shop'
      );

      expect(openShopLinks.length).toBe(2);
      expect(openShopLinks[0].getAttribute('href')).toBe('/vendors/vendor-2');
      expect(openShopLinks[1].getAttribute('href')).toBe('/vendors/vendor%2Fspecial%23123');
    });

    it('renders correct Open Shop link (/vendors/:vendorId) for Stuck Orders', async () => {
      await renderWithRouter('/reliability?queue=orders');

      const openShopLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).filter(
        (a) => a.textContent?.trim() === 'Open shop'
      );

      expect(openShopLinks.length).toBe(3);
      expect(openShopLinks[0].getAttribute('href')).toBe('/vendors/vendor-3');
      expect(openShopLinks[1].getAttribute('href')).toBe('/vendors/vendor%2Fspecial%23123');
      expect(openShopLinks[2].getAttribute('href')).toBe('/vendors/vendor-3');
    });

    it('preserves vendor link in Wallet Blocks notice and attaches #wallet when vendor filter is active', async () => {
      await renderWithRouter('/reliability?queue=wallet&vendorId=vendor-1');

      const vendorsLink = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find(
        (a) => a.textContent?.trim() === 'Vendors'
      );

      expect(vendorsLink).toBeDefined();
      expect(vendorsLink?.getAttribute('href')).toBe('/vendors/vendor-1#wallet');
    });
  });

  // ==========================================
  // 4. UI States (Loading, Empty, Error)
  // ==========================================
  describe('UI States', () => {
    it('displays loading indicator when failed replies query is in progress', async () => {
      vi.mocked(reliabilityApi.getFailedMessages).mockReturnValue(new Promise(() => {}));

      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/reliability?queue=failed']}>
              <Routes>
                <Route path="/reliability" element={<Reliability />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        );
      });

      expect(container.textContent).toContain('Loading failed replies…');
    });

    it('displays clear empty state when failed replies queue returns 0 items', async () => {
      vi.mocked(reliabilityApi.getFailedMessages).mockResolvedValue({
        from: '2026-11-08T10:00:00Z',
        to: '2026-11-09T10:00:00Z',
        count: 0,
        items: [],
      });

      await renderWithRouter('/reliability?queue=failed');

      expect(container.textContent).toContain('No failed replies in this range.');
    });

    it('displays error state when failed replies query fails', async () => {
      vi.mocked(reliabilityApi.getFailedMessages).mockRejectedValue(new Error('Network error'));

      await renderWithRouter('/reliability?queue=failed');

      expect(container.textContent).toContain('Could not load failed replies.');
    });

    it('displays clear empty state when paused conversations queue returns 0 items', async () => {
      vi.mocked(reliabilityApi.getPausedConversations).mockResolvedValue({
        count: 0,
        items: [],
      });

      await renderWithRouter('/reliability?queue=paused');

      expect(container.textContent).toContain('No conversations are currently paused.');
    });

    it('displays error state when paused conversations query fails', async () => {
      vi.mocked(reliabilityApi.getPausedConversations).mockRejectedValue(new Error('DB failure'));

      await renderWithRouter('/reliability?queue=paused');

      expect(container.textContent).toContain('Could not load paused chats.');
    });

    it('displays empty state for stuck orders when 0 orders are stuck', async () => {
      vi.mocked(reliabilityApi.getStuckOrders).mockResolvedValue({
        cutoff: '2026-11-08T10:00:00Z',
        count: 0,
        items: [],
      });
      vi.mocked(reliabilityApi.getOrderAlerts).mockResolvedValue({
        count: 0,
        items: [],
      });

      await renderWithRouter('/reliability?queue=orders');

      expect(container.textContent).toContain('No orders are currently stuck in pending or confirmed status.');
      expect(container.textContent).toContain('No open order alerts.');
    });

    it('displays error state when stuck orders query fails', async () => {
      vi.mocked(reliabilityApi.getStuckOrders).mockRejectedValue(new Error('Query timeout'));

      await renderWithRouter('/reliability?queue=orders');

      expect(container.textContent).toContain('Could not load stuck orders.');
    });

    it('handles Wallet Blocks pending migration state without displaying a misleading success state', async () => {
      await renderWithRouter('/reliability?queue=wallet');

      // Must clearly display the migration pending message
      expect(container.textContent).toContain('WalletBlockEvent Persistence Pending Schema Migration (Decision 2 Option A)');
      expect(container.textContent).toContain('No persisted block events in this range (pending table migration).');
      // Must NOT show misleading fake positive success message
      expect(container.textContent).not.toContain('0 failed blocks - all systems operational');
    });

    it('renders live table with rows and actions when Wallet Blocks status is ready', async () => {
      vi.mocked(reliabilityApi.getWalletBlocks).mockResolvedValue({
        supported: true,
        status: 'ready',
        message: 'WalletBlockEvent persistence active.',
        count: 1,
        items: [
          {
            id: 'wb-live-1',
            vendorId: 'vendor-1',
            conversationId: 'conv-123',
            businessName: 'Annapoorna Foods',
            customerPhone: '+919876543210',
            reason: 'insufficient_balance',
            templateSent: true,
            createdAt: '2026-11-09T10:14:00.000Z',
          },
        ],
      });

      await renderWithRouter('/reliability?queue=wallet');

      expect(container.textContent).not.toContain('WalletBlockEvent Persistence Pending Schema Migration');
      expect(container.textContent).toContain('Annapoorna Foods');
      expect(container.textContent).toContain('+919876543210');
      expect(container.textContent).toContain('insufficient_balance');
      expect(container.textContent).toContain('Sent');

      const openShopLink = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find(
        (a) => a.textContent?.trim() === 'Open shop'
      );
      expect(openShopLink?.getAttribute('href')).toBe('/vendors/vendor-1');

      const openCaseLink = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find(
        (a) => a.textContent?.trim() === 'Open case'
      );
      expect(openCaseLink?.getAttribute('href')).toBe('/support/new?vendorId=vendor-1&conversationId=conv-123');
    });

    it('renders clean empty state when Wallet Blocks status is ready and count is 0', async () => {
      vi.mocked(reliabilityApi.getWalletBlocks).mockResolvedValue({
        supported: true,
        status: 'ready',
        message: 'WalletBlockEvent persistence active.',
        count: 0,
        items: [],
      });

      await renderWithRouter('/reliability?queue=wallet');

      expect(container.textContent).not.toContain('WalletBlockEvent Persistence Pending Schema Migration');
      expect(container.textContent).toContain('No wallet blocks in this range.');
    });
  });

  // ==========================================
  // 5. API Error Summary Card
  // ==========================================
  describe('API Error Summary Card', () => {
    it('displays the API error stats metrics correctly', async () => {
      await renderWithRouter('/reliability');

      expect(container.textContent).toContain('API Process Error Summary');
      expect(container.textContent).toContain('Read-only');
      expect(container.textContent).toContain('14'); // Total since restart
      expect(container.textContent).toContain('0.25 / min'); // Current error rate
      expect(container.textContent).toContain('2h'); // Process uptime
      expect(container.textContent).toContain('VALIDATION_ERROR (10)'); // Top Error Code
    });

    it('displays the explicit API-only caveat and names all five AWS Lambdas', async () => {
      await renderWithRouter('/reliability');

      expect(container.textContent).toContain(
        'These metrics reflect the Express API server process only and reset upon server restart.'
      );
      expect(container.textContent).toContain('webhook-handler');
      expect(container.textContent).toContain('incoming-response-generator');
      expect(container.textContent).toContain('whatsapp-response-dispatcher');
      expect(container.textContent).toContain('media-fetcher');
      expect(container.textContent).toContain('order-recovery');
    });

    it('displays loading state for API error summary when pending', async () => {
      vi.mocked(reliabilityApi.getApiErrorStats).mockReturnValue(new Promise(() => {}));

      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/reliability']}>
              <Routes>
                <Route path="/reliability" element={<Reliability />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        );
      });

      expect(container.textContent).toContain('Loading API error metrics…');
    });

    it('displays error state for API error summary when API call fails', async () => {
      vi.mocked(reliabilityApi.getApiErrorStats).mockRejectedValue(new Error('Stats error'));

      await renderWithRouter('/reliability');

      expect(container.textContent).toContain('Could not load the API error summary.');
    });
  });

  describe('Route-Based Tab Parameters & Deep Links', () => {
    it('renders Paused AI queue directly via route param /reliability/paused', async () => {
      await renderWithRouter('/reliability/paused');
      expect(container.textContent).toContain('Paused AI Conversations');
      expect(container.textContent).toContain('Bakery Delights');
    });

    it('renders Wallet Blocks queue directly via route param /reliability/wallet', async () => {
      await renderWithRouter('/reliability/wallet');
      expect(container.textContent).toContain('Wallet-Blocked Turns');
    });

    it('renders Stuck Orders & Alerts queue directly via route param /reliability/orders', async () => {
      await renderWithRouter('/reliability/orders');
      expect(container.textContent).toContain('Stuck Pending Orders (>24 Hours)');
      expect(container.textContent).toContain('Open Order Alerts');
      expect(container.textContent).toContain('Spice Junction');
    });

    it('deep-links shop names to /vendors/:vendorId in failed queue', async () => {
      await renderWithRouter('/reliability?queue=failed');
      const shopLink = container.querySelector('a[href="/vendors/vendor-1"]');
      expect(shopLink).not.toBeNull();
      expect(shopLink?.textContent).toContain('Annapoorna Foods');
    });

    it('deep-links shop names to /vendors/:vendorId in paused queue', async () => {
      await renderWithRouter('/reliability?queue=paused');
      const pausedShopLink = container.querySelector('a[href="/vendors/vendor-2"]');
      expect(pausedShopLink).not.toBeNull();
      expect(pausedShopLink?.textContent).toContain('Bakery Delights');
    });

    it('provides Open Case action in paused queue pointing to /support/new', async () => {
      await renderWithRouter('/reliability?queue=paused');
      const openCaseLink = container.querySelector(
        'a[href="/support/new?vendorId=vendor-2&conversationId=conv-p1"]'
      );
      expect(openCaseLink).not.toBeNull();
      expect(openCaseLink?.textContent).toContain('Open case');
    });

    it('deep-links wallet block rows to /vendors/:vendorId', async () => {
      const mockLiveWallet: reliabilityApi.WalletBlocksResponse = {
        supported: true,
        status: 'ready',
        message: 'WalletBlockEvent persistence active.',
        from: '2026-11-08T10:00:00Z',
        to: '2026-11-09T10:00:00Z',
        items: [
          {
            id: 'wb-1',
            vendorId: 'vendor-wb',
            businessName: 'Wallet Test Shop',
            customerPhone: '+919876543210',
            reason: 'insufficient_balance',
            createdAt: '2026-11-09T09:00:00Z',
            templateSent: true,
          },
        ],
        count: 1,
      };
      vi.mocked(reliabilityApi.getWalletBlocks).mockResolvedValue(mockLiveWallet);

      await renderWithRouter('/reliability?queue=wallet');
      const walletShopLink = container.querySelector('a[href="/vendors/vendor-wb"]');
      expect(walletShopLink).not.toBeNull();
      expect(walletShopLink?.textContent).toContain('Wallet Test Shop');
    });

    it('deep-links stuck order number and look inside to shop orders tab', async () => {
      await renderWithRouter('/reliability?queue=orders');
      const orderNumberLink = container.querySelector(
        'a[href="/vendors/vendor-3/shop?tab=orders"]'
      );
      expect(orderNumberLink).not.toBeNull();
      expect(orderNumberLink?.textContent).toContain('ORD-901');
    });
  });
});

