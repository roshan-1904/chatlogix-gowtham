import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@chatlogix/ui';
import { useAuth } from '@chatlogix/auth';
import { apiClient } from '../lib/api';
import { orderService } from '../services/orderService';
import { getErrorMessage } from '../utils/errorHandling';
import type { Order } from '../components/conversations/types';
import { OrderStatsCards } from '../components/orders/OrderStatsCards';
import { OrderFilters } from '../components/orders/OrderFilters';
import { OrderListItem } from '../components/orders/OrderListItem';
import {
  DEFAULT_ORDER_VIEW,
  ORDER_VIEW_STORAGE_KEY,
  SORT_OPTIONS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
} from '../utils/orderConstants';
import { navigateToOrderDetails } from '../utils/navigation';

interface OrderStats {
  totalOrders: number;
  todayOrders: number;
  pendingOrders: number;
  totalRevenue: number;
}

export function Orders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({
    totalOrders: 0,
    todayOrders: 0,
    pendingOrders: 0,
    totalRevenue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => {
    const saved = localStorage.getItem(ORDER_VIEW_STORAGE_KEY);
    return (saved as 'table' | 'card') || DEFAULT_ORDER_VIEW;
  });

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const saved = localStorage.getItem('orderListFilters');
    if (saved) {
      try {
        const filters = JSON.parse(saved);
        return filters.status || 'all';
      } catch {
        return 'all';
      }
    }
    return 'all';
  });
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>(() => {
    const saved = localStorage.getItem('orderListFilters');
    if (saved) {
      try {
        const filters = JSON.parse(saved);
        return filters.dateRange || {};
      } catch {
        return {};
      }
    }
    return {};
  });
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    const saved = localStorage.getItem('orderListFilters');
    if (saved) {
      try {
        const filters = JSON.parse(saved);
        return filters.searchQuery || '';
      } catch {
        return '';
      }
    }
    return '';
  });
  const [sortBy, setSortBy] = useState<string>(() => {
    const saved = localStorage.getItem('orderListFilters');
    if (saved) {
      try {
        const filters = JSON.parse(saved);
        return filters.sortBy || SORT_OPTIONS.NEWEST_FIRST;
      } catch {
        return SORT_OPTIONS.NEWEST_FIRST;
      }
    }
    return SORT_OPTIONS.NEWEST_FIRST;
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('orderPageSize');
    return saved ? Number.parseInt(saved, 10) : DEFAULT_PAGE_SIZE;
  });

  // Persist filters
  useEffect(() => {
    localStorage.setItem('orderListFilters', JSON.stringify({
      status: statusFilter,
      dateRange,
      searchQuery,
      sortBy,
    }));
  }, [statusFilter, dateRange, searchQuery, sortBy]);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem(ORDER_VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  // Persist page size
  useEffect(() => {
    localStorage.setItem('orderPageSize', pageSize.toString());
  }, [pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery, dateRange, sortBy]);

  // Load orders
  useEffect(() => {
    const loadOrders = async () => {
      if (!user?.vendorId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        // Build query params
        const queryParams = new URLSearchParams();
        queryParams.set('vendorId', user.vendorId);
        if (statusFilter !== 'all') {
          queryParams.set('status', statusFilter);
        }

        const ordersData = await apiClient.get<Order[]>(`/orders?${queryParams.toString()}`);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      } catch (err: any) {
        const errorMessage = getErrorMessage(err);
        setError(errorMessage);
        console.error('Failed to load orders:', err);
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadOrders();
  }, [user?.vendorId, statusFilter]);

  // Load stats
  useEffect(() => {
    const loadStats = async () => {
      if (!user?.vendorId) {
        setIsLoadingStats(false);
        return;
      }

      setIsLoadingStats(true);
      
      try {
        // Load all orders for accurate stats calculation (without status filter)
        const allOrdersResponse = await apiClient.get<Order[]>(
          `/orders?vendorId=${user.vendorId}`
        );
        const allOrders = Array.isArray(allOrdersResponse) ? allOrdersResponse : [];

        // Get stats from backend
        const statsData = await apiClient.get<{
          totalOrders: number;
          totalRevenue: number;
          statusBreakdown: Array<{ status: string; count: number; revenue: number }>;
        }>(`/orders/vendor/${user.vendorId}/stats`);

        // Calculate today's orders from all orders
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOrders = allOrders.filter(order => {
          const orderDate = new Date(order.createdAt);
          orderDate.setHours(0, 0, 0, 0);
          return orderDate.getTime() === today.getTime();
        }).length;

        // Get pending orders count from status breakdown
        const pendingStatus = statsData.statusBreakdown.find(s => s.status === 'pending');
        const pendingOrders = pendingStatus?.count || 0;

        setStats({
          totalOrders: statsData.totalOrders || 0,
          todayOrders,
          pendingOrders,
          totalRevenue: statsData.totalRevenue || 0,
        });
      } catch (err: any) {
        console.error('Failed to load stats:', err);
        // Don't set error for stats - just use defaults
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadStats();
  }, [user?.vendorId]);

  // Filter and sort orders
  const filteredAndSortedOrders = useMemo(() => {
    let filtered = [...orders];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.orderNumber.toLowerCase().includes(query) ||
        order.customer?.phone?.toLowerCase().includes(query)
      );
    }

    // Date range filter
    if (dateRange.start || dateRange.end) {
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.createdAt);
        if (dateRange.start && orderDate < dateRange.start) return false;
        if (dateRange.end && orderDate > dateRange.end) return false;
        return true;
      });
    }

    // Sort
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
  }, [orders, statusFilter, searchQuery, dateRange, sortBy]);

  // Paginate orders
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedOrders.slice(startIndex, endIndex);
  }, [filteredAndSortedOrders, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAndSortedOrders.length / pageSize);

  const handleOrderClick = (orderId: string) => {
    navigateToOrderDetails(orderId, navigate);
  };

  // Maps a list-item quick-action id to the order status it transitions to.
  // Matches OrderService.validStatusTransitions on the backend.
  const QUICK_ACTION_STATUS: Record<string, string> = {
    confirm: 'confirmed',
    start_preparing: 'preparing',
    mark_ready: 'ready',
    out_for_delivery: 'out_for_delivery',
    mark_delivered: 'delivered',
    cancel: 'cancelled',
  };

  // Not yet implemented on the backend (payment-link generation is a 501
  // stub; shipment creation/tracking don't exist yet) -- surfaced honestly
  // instead of silently doing nothing.
  const NOT_YET_AVAILABLE_ACTIONS = new Set(['send_payment_link', 'create_shipment', 'track', 'view_invoice']);

  const handleQuickAction = async (orderId: string, action: string) => {
    if (action === 'view') {
      handleOrderClick(orderId);
      return;
    }

    if (NOT_YET_AVAILABLE_ACTIONS.has(action)) {
      window.alert('This action is not available yet.');
      return;
    }

    const targetStatus = QUICK_ACTION_STATUS[action];
    if (!targetStatus) {
      console.warn('Unknown quick action:', action, orderId);
      return;
    }

    if (targetStatus === 'cancelled') {
      const confirmed = window.confirm('Are you sure you want to cancel this order? This action cannot be undone.');
      if (!confirmed) return;
    }

    setActionInProgressId(orderId);
    try {
      const updatedOrder = await orderService.updateOrderStatus(orderId, { status: targetStatus });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updatedOrder : o)));
    } catch (err: any) {
      window.alert(getErrorMessage(err) || 'Failed to update order status.');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setDateRange({});
    setSearchQuery('');
    setSortBy(SORT_OPTIONS.NEWEST_FIRST);
    localStorage.removeItem('orderListFilters');
  };

  return (
    <div className="w-full mx-auto h-full overflow-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Orders</h1>
        <p className="text-xs sm:text-sm text-gray-600">
          Manage and track all your orders
        </p>
      </div>

      {/* Stats Cards */}
      <OrderStatsCards stats={stats} isLoading={isLoadingStats} />

      {/* Error Message */}
      {error && (
        <div className="mb-3 sm:mb-4 bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Filters and Controls */}
      <div className="mb-3 sm:mb-4 space-y-3">
        {/* Main Filters Row */}
        <OrderFilters
          statusFilter={statusFilter}
          dateRange={dateRange}
          searchQuery={searchQuery}
          onStatusFilterChange={setStatusFilter}
          onDateRangeChange={setDateRange}
          onSearchChange={setSearchQuery}
          onClearFilters={handleClearFilters}
        />
        
        {/* Sort and View Toggle Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          {/* Sort Dropdown with Icon */}
          <div className="relative w-full sm:w-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full sm:w-auto h-9 px-3 pr-8 text-xs sm:text-sm text-gray-900 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none cursor-pointer"
              aria-label="Sort orders"
            >
              <option value={SORT_OPTIONS.NEWEST_FIRST} className="text-gray-900">Newest First</option>
              <option value={SORT_OPTIONS.OLDEST_FIRST} className="text-gray-900">Oldest First</option>
              <option value={SORT_OPTIONS.AMOUNT_HIGH_TO_LOW} className="text-gray-900">Amount: High→Low</option>
              <option value={SORT_OPTIONS.AMOUNT_LOW_TO_HIGH} className="text-gray-900">Amount: Low→High</option>
            </select>
          </div>

          {/* View Toggle Buttons with Icons */}
          <div className="flex items-center gap-0.5 border border-gray-300 rounded-md p-0.5 bg-gray-50 w-fit">
            <button
              onClick={() => setViewMode('table')}
              className={`h-8 sm:h-9 w-8 sm:w-9 flex items-center justify-center rounded transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              aria-label="Table view"
              title="Table view"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`h-8 sm:h-9 w-8 sm:w-9 flex items-center justify-center rounded transition-colors ${
                viewMode === 'card'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              aria-label="Card view"
              title="Card view"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Order List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-4 rounded-lg border border-gray-200 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : filteredAndSortedOrders.length === 0 ? (
        <div className="text-center py-8 sm:py-12 bg-white rounded-lg border border-gray-200">
          <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">📦</div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No orders found</h3>
          <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 px-4">
            {statusFilter !== 'all' || searchQuery || dateRange.start
              ? 'Try adjusting your filters to see more results.'
              : 'Get started by creating your first order.'}
          </p>
          {(statusFilter !== 'all' || searchQuery || dateRange.start) && (
            <Button variant="secondary" onClick={handleClearFilters} size="sm" className="text-xs sm:text-sm">
              Clear Filters
            </Button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2 sm:py-3 px-2 sm:px-4 md:px-6 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Order #
                  </th>
                  <th className="py-2 sm:py-3 px-2 sm:px-4 md:px-6 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="py-2 sm:py-3 px-2 sm:px-4 md:px-6 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider hidden sm:table-cell">
                    Customer
                  </th>
                  <th className="py-2 sm:py-3 px-2 sm:px-4 md:px-6 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="py-2 sm:py-3 px-2 sm:px-4 md:px-6 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="py-2 sm:py-3 px-2 sm:px-4 md:px-6 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell">
                    Date
                  </th>
                  <th className="py-2 sm:py-3 px-2 sm:px-4 md:px-6 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedOrders.map((order) => (
                  <OrderListItem
                    key={order.id}
                    order={order}
                    onClick={handleOrderClick}
                    onQuickAction={handleQuickAction}
                    viewMode="table"
                    disabled={actionInProgressId === order.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {paginatedOrders.map((order) => (
            <OrderListItem
              key={order.id}
              order={order}
              onClick={handleOrderClick}
              onQuickAction={handleQuickAction}
              viewMode="card"
              disabled={actionInProgressId === order.id}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {filteredAndSortedOrders.length > 0 && (
        <div className="mt-4 sm:mt-6 flex flex-col gap-3 sm:gap-4 bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
          {/* Page Size Selector */}
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <label htmlFor="page-size-select" className="text-xs sm:text-sm text-gray-700 whitespace-nowrap">
              Show:
            </label>
            <select
              id="page-size-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-900 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size} className="text-gray-900">
                  {size}
                </option>
              ))}
            </select>
            <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">per page</span>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-2">
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="min-w-[60px] sm:min-w-[80px] text-xs sm:text-sm"
              >
                First
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="text-xs sm:text-sm"
              >
                Previous
              </Button>
              
              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className="min-w-[32px] sm:min-w-[40px] text-xs sm:text-sm"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="text-xs sm:text-sm"
              >
                Next
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="min-w-[60px] sm:min-w-[80px] text-xs sm:text-sm"
              >
                Last
              </Button>
            </div>

            {/* Page Info */}
            <div className="text-xs sm:text-sm text-gray-600 whitespace-nowrap text-center sm:text-left">
            Showing {paginatedOrders.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, filteredAndSortedOrders.length)} of {filteredAndSortedOrders.length} orders
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

