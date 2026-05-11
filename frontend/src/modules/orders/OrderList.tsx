import React from 'react'

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

interface OrderListProps {
  orders: Order[]
  selectedOrder: Order | null
  stats: OrderStats | null
  isLoading: boolean
  onOrderSelect: (orderId: string) => void
}

export function OrderList({ orders, selectedOrder, stats, isLoading, onOrderSelect }: OrderListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b'
      case 'confirmed': return '#06b6d4'
      case 'preparing': return '#f97316'
      case 'ready': return '#10b981'
      case 'out_for_delivery': return '#8b5cf6'
      case 'delivered': return '#059669'
      case 'cancelled': return '#dc2626'
      default: return '#6b7280'
    }
  }

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`
  }

  const getItemCount = (items: any) => {
    try {
      const parsedItems = typeof items === 'string' ? JSON.parse(items) : items
      return parsedItems.length
    } catch {
      return 0
    }
  }

  return (
    <div className="order-list-container">
      {/* Stats Cards */}
      {stats && (
        <div className="order-stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalOrders}</div>
            <div className="stat-label">Total Orders</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatCurrency(stats.totalRevenue)}</div>
            <div className="stat-label">Revenue</div>
          </div>
          {stats.statusBreakdown.slice(0, 2).map(stat => (
            <div key={stat.status} className="stat-card">
              <div className="stat-value">{stat.count}</div>
              <div className="stat-label">{getStatusLabel(stat.status)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Orders List */}
      <div className="orders-list-header">
        <h3>Orders {isLoading && <span className="loading-indicator">Loading...</span>}</h3>
      </div>

      <div className="orders-list">
        {orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-text">No orders found</div>
            <div className="empty-subtext">Orders will appear here when customers place them</div>
          </div>
        ) : (
          orders.map(order => (
            <div
              key={order.id}
              className={`order-item ${selectedOrder?.id === order.id ? 'selected' : ''}`}
              onClick={() => onOrderSelect(order.id)}
            >
              <div className="order-item-header">
                <div className="order-number">#{order.orderNumber}</div>
                <div 
                  className="order-status"
                  style={{ backgroundColor: getStatusColor(order.status) }}
                >
                  {getStatusLabel(order.status)}
                </div>
              </div>
              
              <div className="order-item-content">
                <div className="order-customer">
                  <span className="customer-icon">👤</span>
                  <span className="customer-phone">{order.customer.phone}</span>
                </div>
                
                <div className="order-meta">
                  <div className="order-items">
                    <span className="items-icon">🛍️</span>
                    <span>{getItemCount(order.items)} item(s)</span>
                  </div>
                  <div className="order-total">{formatCurrency(order.totalAmount)}</div>
                </div>
                
                <div className="order-time">
                  <span className="time-icon">🕒</span>
                  <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
