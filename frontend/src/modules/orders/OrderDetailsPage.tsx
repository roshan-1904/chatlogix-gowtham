import React, { useState, useEffect } from 'react'
import { Breadcrumb } from '../common/Breadcrumb'
import { OrderDetails } from './OrderDetails'
import { useApiClient } from '../../lib/apiClient'
import { useAuth } from '../auth/AuthContext'

// Order Details Page Component

type OrderItem = {
  product: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

type Order = {
  id: string
  vendorId?: string
  customerId?: string
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

interface OrderDetailsPageProps {
  orderId: string
  onBack: () => void
}

export function OrderDetailsPage({ orderId, onBack }: OrderDetailsPageProps) {
  const api = useApiClient()
  const { user } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [customerInsights, setCustomerInsights] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadOrderDetails()
  }, [orderId])

  useEffect(() => {
    if (order) {
      loadCustomerInsights()
    }
  }, [order?.id])

  const loadOrderDetails = async () => {
    setIsLoading(true)
    setError('')
    
    try {
      const data = await api.get<Order>(`/api/orders/${orderId}`)
      if (data) {
        setOrder(data)
      } else {
        setError('Order not found')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load order details')
      console.error('Error loading order details:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadCustomerInsights = async () => {
    if (!order) return
    
    try {
      const vendorId = (order as any).vendorId
      const customerId = (order as any).customerId
      
      if (!vendorId || !customerId) return

      const data = await api.get<{ insights: any }>(
        `/api/vendors/${vendorId}/customer-insights?customerId=${customerId}`
      )
      if (data?.insights) {
        setCustomerInsights(data.insights)
      }
    } catch (err) {
      console.error('Error loading customer insights:', err)
    }
  }

  const updateOrderStatus = async (orderId: string, status: string, additionalData?: any) => {
    try {
      await api.put(`/api/orders/${orderId}/status`, { status, ...additionalData })
      await loadOrderDetails()
    } catch (err: any) {
      setError(err.message || 'Failed to update order status')
      console.error('Error updating order status:', err)
    }
  }

  const saveCustomerNotes = async (orderId: string, notes: string) => {
    try {
      await api.put(`/api/orders/${orderId}/notes`, { customerNotes: notes })
      await loadOrderDetails()
    } catch (err: any) {
      setError(err.message || 'Failed to save notes')
      console.error('Error saving notes:', err)
    }
  }

  const breadcrumbItems = [
    {
      label: 'Order Management',
      onClick: onBack
    },
    {
      label: order ? `Order #${order.orderNumber}` : 'Order Details'
    }
  ]

  if (isLoading) {
    return (
      <div className="order-details-page">
        <div className="page-header">
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div className="loading-state">
          <div className="loading-spinner">⏳</div>
          <div>Loading order details...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="order-details-page">
        <div className="page-header">
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div className="error-state">
          <div className="error-icon">❌</div>
          <div className="error-message">{error}</div>
          <button onClick={loadOrderDetails} className="retry-btn">
            🔄 Retry
          </button>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="order-details-page">
        <div className="page-header">
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div className="empty-text">Order not found</div>
          <button onClick={onBack} className="back-btn">
            ← Back to Orders
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="order-details-page">
      <div className="page-header">
        <Breadcrumb items={breadcrumbItems} />
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>

      <div className="order-details-content">
        <OrderDetails
          order={order}
          customerInsights={customerInsights}
          onStatusUpdate={updateOrderStatus}
          onNotesSave={saveCustomerNotes}
        />
      </div>
    </div>
  )
}
