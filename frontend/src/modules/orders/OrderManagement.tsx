import React, { useState, useEffect } from 'react'
import { OrderList } from './OrderList'
import { useApiClient } from '../../lib/apiClient'
import { useAuth } from '../auth/AuthContext'

type OrderItem = {
  product: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

type Order = {
  id: string
  orderNumber: string
  status: string
  items: OrderItem[]
  totalAmount: number
  deliveryAddress?: string
  deliveryInstructions?: string
  specialRequests?: string
  customerNotes?: string
  estimatedDelivery?: string
  confirmedAt?: string
  preparedAt?: string
  deliveredAt?: string
  cancelledAt?: string
  cancellationReason?: string
  createdAt: string
  updatedAt: string
  customer: {
    phone: string
  }
  vendor: {
    businessName: string
    aiBotName?: string
  }
  conversation: {
    id: string
    messages: Array<{
      content: string
      senderType: string
      timestamp: string
    }>
  }
}

type OrderStats = {
  totalOrders: number
  totalRevenue: number
  statusBreakdown: Array<{
    status: string
    count: number
    revenue: number
  }>
}

interface OrderManagementProps {
  onOrderSelect: (orderId: string) => void
}

export function OrderManagement({ onOrderSelect }: OrderManagementProps) {
  const api = useApiClient()
  const { user } = useAuth()
  const isAdmin = user?.roles.includes('admin')
  const vendorIdFromUser = user?.vendorId || ''
  const [vendors, setVendors] = useState<any[]>([])
  const [selectedVendor, setSelectedVendor] = useState<string>('')
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<OrderStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    if (!user) return
    loadVendors()
  }, [user])

  useEffect(() => {
    if (selectedVendor) {
      loadOrders()
      loadStats()
    }
  }, [selectedVendor, statusFilter])

  const loadVendors = async () => {
    try {
      if (isAdmin) {
        const data = await api.get<any[]>('/api/vendors')
        if (Array.isArray(data)) {
          setVendors(data)
          if (data.length > 0) {
            setSelectedVendor(data[0].id)
          }
        }
      } else if (vendorIdFromUser) {
        const config = await api.get<{
          id: string
          businessName: string
          plan: string
        }>(`/api/vendors/${vendorIdFromUser}/config`)
        if (config) {
          const vendor = {
            id: config.id,
            businessName: config.businessName,
            subscriptionPlan: config.plan
          }
          setVendors([vendor])
          setSelectedVendor(config.id)
        }
      }
    } catch (err) {
      console.error('Error loading vendors:', err)
    }
  }

  const loadOrders = async () => {
    if (!selectedVendor) return
    
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ vendorId: selectedVendor })
      if (statusFilter) {
        params.append('status', statusFilter)
      }
      const data = await api.get<Order[]>(`/api/orders?${params.toString()}`)
      if (Array.isArray(data)) {
        setOrders(data)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load orders')
      console.error('Error loading orders:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadStats = async () => {
    if (!selectedVendor) return
    
    try {
      const data = await api.get<OrderStats>(`/api/orders/vendor/${selectedVendor}/stats`)
      if (data) {
        setStats(data)
      }
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }

  return (
    <div className="order-management-page">
      <div className="page-header">
        <h2>Order Management</h2>
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="filters-container">
        <div className="filter-group">
          <label>Select Vendor:</label>
          {isAdmin ? (
            <select 
              value={selectedVendor} 
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="filter-select"
            >
              <option value="">Choose a vendor...</option>
              {vendors.map(vendor => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.businessName}
                </option>
              ))}
            </select>
          ) : (
            <div className="filter-value">
              {vendors[0]?.businessName || 'My Vendor'}
            </div>
          )}
        </div>

        <div className="filter-group">
          <label>Filter by Status:</label>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Orders</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {selectedVendor && (
        <div className="order-management-layout">
          <div className="order-list-panel">
            <OrderList
              orders={orders}
              selectedOrder={null}
              stats={stats}
              isLoading={isLoading}
              onOrderSelect={onOrderSelect}
            />
          </div>
        </div>
      )}
    </div>
  )
}
