import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@chatlogix/auth';
import { apiClient } from '../lib/api';
import { orderService } from '../services/orderService';
import { getErrorMessage } from '../utils/errorHandling';
import type { Order } from '../components/conversations/types';
import { OrderStatsCards } from '../components/orders/OrderStatsCards';
import { OrderWorkbar } from '../components/orders/OrderWorkbar';
import { OrderTable } from '../components/orders/OrderTable';
import {
  DATE_PRESETS,
  DEFAULT_PAGE_SIZE,
  ORDER_VIEW_STORAGE_KEY,
  PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
} from '../utils/orderConstants';
import { mergeOrder, orderNeedsAttention, matchesPaymentFilter, type PaymentFilter } from '../utils/orderPayment';
import { navigateToOrderDetails } from '../utils/navigation';

interface OrderStats {
  totalOrders: number;
  todayOrders: number;
  needAttention: number;
  totalRevenue: number;
}

const PAYMENT_FILTERS: PaymentFilter[] = ['all', 'unpaid', 'link_sent', 'upi_sent', 'paid', 'cash'];
const DATE_PRESET_IDS = [DATE_PRESETS.TODAY, DATE_PRESETS.THIS_WEEK, DATE_PRESETS.THIS_MONTH];

function readSavedFilters(): {
  status: string;
  payment: PaymentFilter;
  datePreset: string | null;
  searchQuery: string;
  sortBy: string;
} {
  const fallback = {
    status: 'all',
    payment: 'all' as PaymentFilter,
    datePreset: null as string | null,
    searchQuery: '',
    sortBy: SORT_OPTIONS.NEWEST_FIRST,
  };
  const saved = localStorage.getItem('orderListFilters');
  if (!saved) return fallback;
  try {
    const filters = JSON.parse(saved) as Record<string, unknown>;
    const payment = typeof filters.payment === 'string' && PAYMENT_FILTERS.includes(filters.payment as PaymentFilter)
      ? (filters.payment as PaymentFilter)
      : 'all';
    const datePreset = typeof filters.datePreset === 'string' && DATE_PRESET_IDS.includes(filters.datePreset)
      ? filters.datePreset
      : null;
    return {
      status: typeof filters.status === 'string' ? filters.status : 'all',
      payment,
      datePreset,
      searchQuery: typeof filters.searchQuery === 'string' ? filters.searchQuery : '',
      sortBy: typeof filters.sortBy === 'string' ? filters.sortBy : SORT_OPTIONS.NEWEST_FIRST,
    };
  } catch {
    return fallback;
  }
}

function presetToRange(preset: string | null): { start?: Date; end?: Date } {
  if (!preset) return {};
  const now = new Date();
  const end = new Date();
  const start = new Date(now);
  if (preset === DATE_PRESETS.TODAY) {
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (preset === DATE_PRESETS.THIS_WEEK) {
    start.setDate(now.getDate() - 7);
    return { start, end };
  }
  if (preset === DATE_PRESETS.THIS_MONTH) {
    start.setMonth(now.getMonth() - 1);
    return { start, end };
  }
  return {};
}

function useIsMdUp(): boolean {
  const [isMdUp, setIsMdUp] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsMdUp(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return isMdUp;
}

export function Orders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const saved = useState(readSavedFilters)[0];
  const isMdUp = useIsMdUp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({
    totalOrders: 0,
    todayOrders: 0,
    needAttention: 0,
    totalRevenue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [desktopView, setDesktopView] = useState<'table' | 'card'>(() =>
    localStorage.getItem(ORDER_VIEW_STORAGE_KEY) === 'card' ? 'card' : 'table'
  );
  const [mobileView, setMobileView] = useState<'table' | 'card'>('card');
  const viewMode = isMdUp ? desktopView : mobileView;

  const [statusFilter, setStatusFilter] = useState(saved.status);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>(saved.payment);
  const [datePreset, setDatePreset] = useState<string | null>(saved.datePreset);
  const [searchQuery, setSearchQuery] = useState(saved.searchQuery);
  const [sortBy, setSortBy] = useState(saved.sortBy);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const stored = localStorage.getItem('orderPageSize');
    return stored ? Number.parseInt(stored, 10) : DEFAULT_PAGE_SIZE;
  });

  const dateRange = useMemo(() => presetToRange(datePreset), [datePreset]);

  useEffect(() => {
    localStorage.setItem(
      'orderListFilters',
      JSON.stringify({ status: statusFilter, payment: paymentFilter, datePreset, searchQuery, sortBy })
    );
  }, [statusFilter, paymentFilter, datePreset, searchQuery, sortBy]);

  useEffect(() => {
    localStorage.setItem('orderPageSize', pageSize.toString());
  }, [pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentFilter, searchQuery, datePreset, sortBy]);

  useEffect(() => {
    const loadOrders = async () => {
      if (!user?.vendorId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('vendorId', user.vendorId);
        if (statusFilter !== 'all') queryParams.set('status', statusFilter);
        const ordersData = await apiClient.get<Order[]>(`/orders?${queryParams.toString()}`);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadOrders();
  }, [user?.vendorId, statusFilter]);

  useEffect(() => {
    const loadStats = async () => {
      if (!user?.vendorId) {
        setIsLoadingStats(false);
        return;
      }

      setIsLoadingStats(true);
      try {
        const allOrdersResponse = await apiClient.get<Order[]>(`/orders?vendorId=${user.vendorId}`);
        const allOrders = Array.isArray(allOrdersResponse) ? allOrdersResponse : [];
        const statsData = await apiClient.get<{
          totalOrders: number;
          totalRevenue: number;
          statusBreakdown: Array<{ status: string; count: number; revenue: number }>;
        }>(`/orders/vendor/${user.vendorId}/stats`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOrders = allOrders.filter((order) => {
          const orderDate = new Date(order.createdAt);
          orderDate.setHours(0, 0, 0, 0);
          return orderDate.getTime() === today.getTime();
        }).length;

        const pendingFromStats = statsData.statusBreakdown.find((row) => row.status === 'pending')?.count ?? 0;
        const attentionFromOrders = allOrders.filter(orderNeedsAttention).length;

        setStats({
          totalOrders: statsData.totalOrders || 0,
          todayOrders,
          needAttention: allOrders.length > 0 || attentionFromOrders > 0 ? attentionFromOrders : pendingFromStats,
          totalRevenue: statsData.totalRevenue || 0,
        });
      } catch {
        // Stats are optional; the list still renders.
      } finally {
        setIsLoadingStats(false);
      }
    };

    void loadStats();
  }, [user?.vendorId]);

  const filteredAndSortedOrders = useMemo(() => {
    let filtered = orders.filter((order) => matchesPaymentFilter(order, paymentFilter));

    if (statusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(query) ||
          order.customer?.phone?.toLowerCase().includes(query)
      );
    }

    if (dateRange.start || dateRange.end) {
      filtered = filtered.filter((order) => {
        const orderDate = new Date(order.createdAt);
        if (dateRange.start && orderDate < dateRange.start) return false;
        if (dateRange.end && orderDate > dateRange.end) return false;
        return true;
      });
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case SORT_OPTIONS.NEWEST_FIRST:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case SORT_OPTIONS.OLDEST_FIRST:
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case SORT_OPTIONS.AMOUNT_HIGH_TO_LOW:
          return b.totalAmount - a.totalAmount;
        case SORT_OPTIONS.AMOUNT_LOW_TO_HIGH:
          return a.totalAmount - b.totalAmount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [orders, statusFilter, paymentFilter, searchQuery, dateRange, sortBy]);

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSortedOrders.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedOrders, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedOrders.length / pageSize));

  const setViewMode = (mode: 'table' | 'card') => {
    if (isMdUp) {
      setDesktopView(mode);
      localStorage.setItem(ORDER_VIEW_STORAGE_KEY, mode);
      return;
    }
    setMobileView(mode);
  };

  const applyStatus = async (orderId: string, status: string) => {
    setActionInProgressId(orderId);
    try {
      const updatedOrder = await orderService.updateOrderStatus(orderId, {
        status,
        ...(status === 'cancelled' ? { cancellationReason: 'Cancelled by vendor' } : {}),
      });
      setOrders((prev) => prev.map((order) => (order.id === orderId ? mergeOrder(order, updatedOrder) : order)));
    } catch (err: unknown) {
      window.alert(getErrorMessage(err) || 'Failed to update order status.');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleAdvance = (orderId: string, nextStatus: string) => {
    void applyStatus(orderId, nextStatus);
  };

  const handleCancel = (orderId: string) => {
    const confirmed = window.confirm('Are you sure you want to cancel this order? This action cannot be undone.');
    if (!confirmed) return;
    void applyStatus(orderId, 'cancelled');
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setPaymentFilter('all');
    setDatePreset(null);
    setSearchQuery('');
    setSortBy(SORT_OPTIONS.NEWEST_FIRST);
  };

  const filtersActive = statusFilter !== 'all' || paymentFilter !== 'all' || !!datePreset || !!searchQuery;

  return (
    <div className="mx-auto h-full w-full overflow-auto">
      <div className="mb-4">
        <h1 className="mb-1 text-xl font-bold text-gray-900 sm:text-2xl">Orders</h1>
        <p className="text-sm text-gray-600">Manage and track all your orders</p>
      </div>

      <OrderStatsCards stats={stats} isLoading={isLoadingStats} />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <OrderWorkbar
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        paymentFilter={paymentFilter}
        datePreset={datePreset}
        sortBy={sortBy}
        viewMode={viewMode}
        onSearchChange={setSearchQuery}
        onStatusFilterChange={setStatusFilter}
        onPaymentFilterChange={setPaymentFilter}
        onDatePresetChange={setDatePreset}
        onSortChange={setSortBy}
        onViewModeChange={setViewMode}
        onClearFilters={handleClearFilters}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((row) => (
            <div key={row} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 h-4 w-1/4 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      ) : filteredAndSortedOrders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center">
          <h3 className="mb-2 text-base font-medium text-gray-900">No orders found</h3>
          <p className="mb-4 text-sm text-gray-500">
            {filtersActive ? 'Try adjusting your filters to see more results.' : 'Orders will show up here once customers place them.'}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <OrderTable
          orders={paginatedOrders}
          viewMode={viewMode}
          busyOrderId={actionInProgressId}
          onOpen={(orderId) => navigateToOrderDetails(orderId, navigate)}
          onAdvance={handleAdvance}
          onCancel={handleCancel}
        />
      )}

      {filteredAndSortedOrders.length > 0 && (
        <OrderPagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          total={filteredAndSortedOrders.length}
          pageCount={paginatedOrders.length}
          onPageSize={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
          onPage={setCurrentPage}
        />
      )}
    </div>
  );
}

function OrderPagination({
  currentPage,
  totalPages,
  pageSize,
  total,
  pageCount,
  onPageSize,
  onPage,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  total: number;
  pageCount: number;
  onPageSize: (size: number) => void;
  onPage: (page: number) => void;
}) {
  const from = pageCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const to = Math.min(currentPage * pageSize, total);
  const pages = pageWindow(currentPage, totalPages);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      <div className="flex items-center justify-center gap-2 sm:justify-start">
        <label htmlFor="page-size-select" className="text-sm text-gray-700">
          Show
        </label>
        <select
          id="page-size-select"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">per page</span>
      </div>
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-1">
          <PageButton disabled={currentPage === 1} onClick={() => onPage(1)}>
            First
          </PageButton>
          <PageButton disabled={currentPage === 1} onClick={() => onPage(Math.max(1, currentPage - 1))}>
            Previous
          </PageButton>
          {pages.map((pageNum) => (
            <PageButton key={pageNum} current={pageNum === currentPage} onClick={() => onPage(pageNum)}>
              {pageNum}
            </PageButton>
          ))}
          <PageButton disabled={currentPage === totalPages} onClick={() => onPage(Math.min(totalPages, currentPage + 1))}>
            Next
          </PageButton>
          <PageButton disabled={currentPage === totalPages} onClick={() => onPage(totalPages)}>
            Last
          </PageButton>
        </div>
        <p className="text-sm text-gray-600">
          Showing {from}–{to} of {total} orders
        </p>
      </div>
    </div>
  );
}

function pageWindow(currentPage: number, totalPages: number): number[] {
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    if (totalPages <= 5) return index + 1;
    if (currentPage <= 3) return index + 1;
    if (currentPage >= totalPages - 2) return totalPages - 4 + index;
    return currentPage - 2 + index;
  });
}

function PageButton({
  children,
  current = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border bg-white px-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
        current ? 'border-primary-500 text-primary-500' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}
