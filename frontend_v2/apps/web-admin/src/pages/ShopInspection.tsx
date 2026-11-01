import { useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Button } from '@chatlogix/ui';
import { apiClient } from '../lib/api';
import { recordStaffAudit } from '../lib/controls';
import { getVendorConfig, type AdminVendorConfig } from '../lib/vendors';

interface ProductItem {
  id: string;
  name: string;
  basePrice: number; // paise
  isActive: boolean;
  inStock: boolean;
  category?: string;
}

interface OrderItem {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number; // paise
  createdAt: string;
}

interface CustomerQueryItem {
  id: string;
  questionEn: string;
  category: string;
  hitCount: number;
  lastSeenAt: string;
  status: string;
}

export function ShopInspection() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'catalog';

  // Vendor metadata
  const { data: vendorConfig } = useQuery<AdminVendorConfig>({
    queryKey: ['vendor-config', vendorId],
    queryFn: () => getVendorConfig(vendorId!),
    enabled: Boolean(vendorId),
  });

  // Record audit on tab switch
  useEffect(() => {
    if (vendorId) {
      void recordStaffAudit(
        'shop_viewed',
        vendorId,
        `Staff inspected ${activeTab} tab for vendor ${vendorConfig?.businessName || vendorId}`,
        { tab: activeTab }
      );
    }
  }, [vendorId, activeTab, vendorConfig?.businessName]);

  // 1. Catalog Query
  const {
    data: products,
    isLoading: productsLoading,
    isError: productsError,
  } = useQuery<ProductItem[]>({
    queryKey: ['inspect-products', vendorId],
    queryFn: async () => {
      const res = await apiClient.get<any>(`/products?vendorId=${vendorId}`);
      return Array.isArray(res) ? res : res.products || [];
    },
    enabled: Boolean(vendorId) && activeTab === 'catalog',
  });

  // 2. Orders Query
  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
  } = useQuery<OrderItem[]>({
    queryKey: ['inspect-orders', vendorId],
    queryFn: async () => {
      const res = await apiClient.get<any>(`/orders?vendorId=${vendorId}`);
      return Array.isArray(res) ? res : res.orders || [];
    },
    enabled: Boolean(vendorId) && activeTab === 'orders',
  });

  // 3. Customer Questions Query
  const {
    data: queries,
    isLoading: queriesLoading,
    isError: queriesError,
  } = useQuery<CustomerQueryItem[]>({
    queryKey: ['inspect-queries', vendorId],
    queryFn: async () => {
      const res = await apiClient.get<any>(`/customer-queries?vendorId=${vendorId}&status=open`);
      return Array.isArray(res) ? res : res.queries || res.items || [];
    },
    enabled: Boolean(vendorId) && activeTab === 'queries',
  });

  const handleTabChange = (tab: 'catalog' | 'orders' | 'queries') => {
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <Link
          to="/vendors"
          className="text-xs font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 mb-2"
        >
          &larr; Back to Vendors
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {vendorConfig?.businessName || 'Shop Inspection'}
            </h1>
            <p className="text-xs font-mono text-gray-500 mt-0.5">Vendor ID: {vendorId}</p>
          </div>
          <Link to={`/support/new?vendorId=${vendorId}`}>
            <Button variant="ghost" size="sm" className="border border-gray-300 text-xs">
              + Open Support Case
            </Button>
          </Link>
        </div>
      </div>

      {/* Staff Inspection Notice */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <span>🔍</span>
          <span className="font-semibold text-blue-950">
            Read-only Inspection Mode — You are signed in as staff, not as this shop.
          </span>
        </div>
        <span className="text-[11px] text-blue-700 italic">Audit logged as shop_viewed</span>
      </div>

      {/* Subnav Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => handleTabChange('catalog')}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'catalog'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Catalog Products
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('orders')}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'orders'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Shop Orders
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('queries')}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'queries'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Open Customer Questions
        </button>
      </div>

      {/* TAB 1: CATALOG */}
      {activeTab === 'catalog' && (
        <Card className="p-0 overflow-hidden border border-gray-200/80 shadow-sm bg-white">
          {productsLoading ? (
            <div className="p-12 text-center text-sm text-gray-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent mb-2"></div>
              <p>Loading shop catalog…</p>
            </div>
          ) : productsError ? (
            <div className="p-12 text-center text-sm text-red-600">
              <p className="font-semibold">Could not load catalog products.</p>
            </div>
          ) : !products || products.length === 0 ? (
            <div className="p-16 text-center text-sm text-gray-400 space-y-2">
              <span className="text-3xl block">📦</span>
              <p className="font-semibold text-gray-700">Catalog is empty</p>
              <p className="text-xs text-gray-400">This shop has not imported or created any products yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600 tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Product Name</th>
                    <th className="px-6 py-3.5">Base Price</th>
                    <th className="px-6 py-3.5">Active</th>
                    <th className="px-6 py-3.5">Stock</th>
                    <th className="px-6 py-3.5">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((p) => {
                    const priceRupees = (p.basePrice / 100).toFixed(2);
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                          {p.name}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-800 whitespace-nowrap">
                          ₹{priceRupees}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={p.isActive ? 'success' : 'default'}>
                            {p.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={p.inStock ? 'success' : 'warning'}>
                            {p.inStock ? 'In Stock' : 'Out of Stock'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                          {p.category || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: ORDERS */}
      {activeTab === 'orders' && (
        <Card className="p-0 overflow-hidden border border-gray-200/80 shadow-sm bg-white">
          {ordersLoading ? (
            <div className="p-12 text-center text-sm text-gray-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent mb-2"></div>
              <p>Loading shop orders…</p>
            </div>
          ) : ordersError ? (
            <div className="p-12 text-center text-sm text-red-600">
              <p className="font-semibold">Could not load orders.</p>
            </div>
          ) : !orders || orders.length === 0 ? (
            <div className="p-16 text-center text-sm text-gray-400 space-y-2">
              <span className="text-3xl block">🛍️</span>
              <p className="font-semibold text-gray-700">No orders recorded</p>
              <p className="text-xs text-gray-400">This shop has received no customer orders yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600 tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Order Number</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Amount</th>
                    <th className="px-6 py-3.5">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((o) => {
                    const amountRupees = (o.totalAmount / 100).toFixed(2);
                    return (
                      <tr key={o.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs font-bold text-gray-900 whitespace-nowrap">
                          {o.orderNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="default">{o.status}</Badge>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-gray-900 whitespace-nowrap">
                          ₹{amountRupees}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(o.createdAt).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: QUESTIONS */}
      {activeTab === 'queries' && (
        <Card className="p-0 overflow-hidden border border-gray-200/80 shadow-sm bg-white">
          {queriesLoading ? (
            <div className="p-12 text-center text-sm text-gray-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent mb-2"></div>
              <p>Loading customer questions…</p>
            </div>
          ) : queriesError ? (
            <div className="p-12 text-center text-sm text-red-600">
              <p className="font-semibold">Could not load customer questions.</p>
            </div>
          ) : !queries || queries.length === 0 ? (
            <div className="p-16 text-center text-sm text-gray-400 space-y-2">
              <span className="text-3xl block">💬</span>
              <p className="font-semibold text-gray-700">No open customer questions</p>
              <p className="text-xs text-gray-400">All customer inquiries have been answered or dismissed by the vendor.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600 tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Customer Question</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Frequency</th>
                    <th className="px-6 py-3.5">Last Asked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {queries.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-6 py-4 font-semibold text-gray-900 max-w-md">
                        {q.questionEn}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="default">{q.category}</Badge>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {q.hitCount} time{q.hitCount === 1 ? '' : 's'}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(q.lastSeenAt).toLocaleDateString([], {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
