import React, { useState } from 'react'
import '../../styles/components/OrderDetailsPage.scss'

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
    phone?: string
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

interface CustomerInsights {
  basicDetails?: string
  purchaseHistory?: string
  preferences?: string
  communicationStyle?: string
  currentOrder?: string
  deliveryAddress?: string
  deliveryInstructions?: string
  specialRequests?: string
  lastUpdated?: string
  createdAt?: string
}

interface OrderDetailsProps {
  order: Order
  customerInsights?: CustomerInsights | null
  onStatusUpdate: (orderId: string, status: string, additionalData?: any) => Promise<void>
  onNotesSave: (orderId: string, notes: string) => Promise<void>
}

export function OrderDetails({ order, customerInsights, onStatusUpdate, onNotesSave }: OrderDetailsProps) {
  const [editableNotes, setEditableNotes] = useState(order.customerNotes || '')
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  // Helper functions
  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`
  }

  const parseItems = (items: any) => {
    try {
      return typeof items === 'string' ? JSON.parse(items) : items
    } catch {
      return []
    }
  }

  const formatDeliveryDateTime = (dateTime: string | Date) => {
    const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime
    if (isNaN(date.getTime())) return 'Invalid date'
    
    // Convert UTC date to IST (Asia/Kolkata) for display
    // Use Intl.DateTimeFormat to properly handle timezone conversion
    const istFormatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    
    // Get the formatted parts
    const parts = istFormatter.formatToParts(date)
    const day = parts.find(p => p.type === 'day')?.value || ''
    const month = parts.find(p => p.type === 'month')?.value || ''
    const year = parts.find(p => p.type === 'year')?.value || ''
    const hour = parts.find(p => p.type === 'hour')?.value || ''
    const minute = parts.find(p => p.type === 'minute')?.value || ''
    const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || ''
    
    return `${day}/${month}/${year} ${hour}:${minute} ${dayPeriod.toUpperCase()}`
  }

  const getMockPaymentDelivery = (order: Order) => ({
    payment: {
      method: 'Cash on Delivery',
      transactionId: `TXN${order.orderNumber}`,
      status: order.status === 'delivered' ? 'Completed' : 'Pending'
    },
    delivery: {
      partner: 'Self Delivery',
      trackingId: `TRACK${order.orderNumber}`,
      estimatedDate: order.estimatedDelivery
    }
  })

  const getTimelineEvents = (order: Order) => {
    const events = []
    
    events.push({
      label: 'Order Placed',
      timestamp: order.createdAt,
      icon: '📝',
      status: 'completed'
    })
    
    if (order.estimatedDelivery && !order.deliveredAt) {
      events.push({
        label: 'Estimated Delivery',
        timestamp: order.estimatedDelivery,
        icon: '📅',
        status: 'scheduled',
        formattedTime: formatDeliveryDateTime(order.estimatedDelivery)
      })
    }
    
    if (order.confirmedAt) {
      events.push({
        label: 'Order Confirmed',
        timestamp: order.confirmedAt,
        icon: '✅',
        status: 'completed'
      })
    }
    
    if (order.preparedAt) {
      events.push({
        label: 'Preparation Started',
        timestamp: order.preparedAt,
        icon: '👨‍🍳',
        status: 'completed'
      })
    }
    
    if (order.deliveredAt) {
      events.push({
        label: 'Order Delivered',
        timestamp: order.deliveredAt,
        icon: '🎉',
        status: 'completed'
      })
    }
    
    if (order.cancelledAt) {
      events.push({
        label: 'Order Cancelled',
        timestamp: order.cancelledAt,
        icon: '❌',
        status: 'cancelled',
        reason: order.cancellationReason
      })
    }
    
    return events
  }

  const progressSteps = [
    { key: 'pending', label: 'Placed' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'ready', label: 'Ready' },
    { key: 'out_for_delivery', label: 'Out for Delivery' },
    { key: 'delivered', label: 'Delivered' }
  ]

  const getCurrentStepIndex = () => {
    return progressSteps.findIndex(step => step.key === order.status)
  }

  const handleNotesSave = async () => {
    setIsSavingNotes(true)
    try {
      await onNotesSave(order.id, editableNotes)
    } finally {
      setIsSavingNotes(false)
    }
  }

  const getActionButtons = () => {
    const buttons = []

    switch (order.status) {
      case 'pending':
        buttons.push(
          <button
            key="confirm"
            className="order-details__action-btn order-details__action-btn--confirm"
            onClick={() => {
              const delivery = prompt('Estimated delivery date (optional):')
              onStatusUpdate(order.id, 'confirmed', { estimatedDelivery: delivery || undefined })
            }}
          >
            ✓ Confirm Order
          </button>
        )
        break
      case 'confirmed':
        buttons.push(
          <button
            key="preparing"
            className="order-details__action-btn order-details__action-btn--preparing"
            onClick={() => onStatusUpdate(order.id, 'preparing')}
          >
            🔥 Start Preparing
          </button>
        )
        break
      case 'preparing':
        buttons.push(
          <button
            key="ready"
            className="order-details__action-btn order-details__action-btn--ready"
            onClick={() => onStatusUpdate(order.id, 'ready')}
          >
            ✅ Mark Ready
          </button>
        )
        break
      case 'ready':
        buttons.push(
          <button
            key="delivery"
            className="order-details__action-btn order-details__action-btn--delivery"
            onClick={() => onStatusUpdate(order.id, 'out_for_delivery')}
          >
            🚚 Out for Delivery
          </button>
        )
        break
      case 'out_for_delivery':
        buttons.push(
          <button
            key="delivered"
            className="order-details__action-btn order-details__action-btn--delivered"
            onClick={() => onStatusUpdate(order.id, 'delivered')}
          >
            🎉 Mark Delivered
          </button>
        )
        break
    }

    if (!['delivered', 'cancelled'].includes(order.status)) {
      buttons.push(
        <button
          key="cancel"
          className="order-details__action-btn order-details__action-btn--cancel"
          onClick={() => {
            const reason = prompt('Cancellation reason:')
            if (reason) {
              onStatusUpdate(order.id, 'cancelled', { cancellationReason: reason })
            }
          }}
        >
          ❌ Cancel Order
        </button>
      )
    }

    return buttons
  }

  const items = parseItems(order.items)
  const mockData = getMockPaymentDelivery(order)
  const timelineEvents = getTimelineEvents(order)
  const currentStepIndex = getCurrentStepIndex()

  return (
    <div className="order-details">
      {/* Order Overview Section */}
      <div className="order-details__overview">
        <div className="order-details__order-info">
          <div className="order-details__order-number">#{order.orderNumber}</div>
          <div className="order-details__order-date">
            {new Date(order.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="order-details__order-total">
          {formatCurrency(order.totalAmount)}
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="order-details__progress">
        {progressSteps.map((step, index) => (
          <div key={step.key} className="order-details__progress-step">
            <div 
              className={`order-details__progress-icon ${
                index < currentStepIndex ? 'order-details__progress-icon--completed' :
                index === currentStepIndex ? 'order-details__progress-icon--current' : ''
              }`}
            >
              {index < currentStepIndex ? '✓' : index + 1}
            </div>
            <div className="order-details__progress-label">{step.label}</div>
          </div>
        ))}
      </div>

      {/* Vendor Information */}
      <div className="order-details__card order-details__vendor-panel">
        <div className="order-details__card-header">
          <h3 className="order-details__card-title">Vendor Information</h3>
        </div>
        <div className="order-details__vendor-info">
          <div className="order-details__info-row">
            <span className="order-details__info-label">Business Name:</span>
            <span className="order-details__info-text">{order.vendor.businessName}</span>
          </div>
          {order.vendor.aiBotName && (
            <div className="order-details__info-row">
              <span className="order-details__info-label">AI Bot Name:</span>
              <span className="order-details__info-text">{order.vendor.aiBotName}</span>
            </div>
          )}
          {order.vendor.phone && (
            <div className="order-details__info-row">
              <span className="order-details__info-label">Phone:</span>
              <a href={`tel:${order.vendor.phone}`} className="order-details__info-text">
                {order.vendor.phone}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Customer Info Panel */}
      <div className="order-details__card order-details__customer-panel">
        <div className="order-details__card-header">
          <h3 className="order-details__card-title">Customer Information</h3>
        </div>
        <div className="order-details__customer-info">
          <div className="order-details__info-row">
            <span className="order-details__info-icon">👤</span>
            <a href={`tel:${order.customer.phone}`} className="order-details__info-text order-details__info-text--link">
              {order.customer.phone}
            </a>
          </div>
          {order.deliveryAddress && (
            <div className="order-details__info-row">
              <span className="order-details__info-icon">📍</span>
              <span className="order-details__info-text">{order.deliveryAddress}</span>
            </div>
          )}
          {order.deliveryInstructions && (
            <div className="order-details__info-row">
              <span className="order-details__info-icon">📋</span>
              <span className="order-details__info-text">{order.deliveryInstructions}</span>
            </div>
          )}
          {order.specialRequests && (
            <div className="order-details__info-row">
              <span className="order-details__info-icon">⭐</span>
              <span className="order-details__info-text">{order.specialRequests}</span>
            </div>
          )}
          <div className="order-details__link">
            View Previous Orders →
          </div>
        </div>
      </div>

      {/* Customer Insights Panel */}
      {customerInsights && (
        <div className="order-details__card order-details__insights-panel">
          <div className="order-details__card-header">
            <h3 className="order-details__card-title">Customer Insights</h3>
          </div>
          <div className="order-details__customer-info">
            {customerInsights.basicDetails && (
              <div className="order-details__info-section">
                <div className="order-details__info-label">👤 Basic Details</div>
                <div className="order-details__info-text order-details__info-text--insight">
                  {customerInsights.basicDetails}
                </div>
              </div>
            )}
            {customerInsights.purchaseHistory && (
              <div className="order-details__info-section">
                <div className="order-details__info-label">🛒 Purchase History</div>
                <div className="order-details__info-text order-details__info-text--insight">
                  {customerInsights.purchaseHistory}
                </div>
              </div>
            )}
            {customerInsights.preferences && (
              <div className="order-details__info-section">
                <div className="order-details__info-label">⭐ Preferences</div>
                <div className="order-details__info-text order-details__info-text--insight">
                  {customerInsights.preferences}
                </div>
              </div>
            )}
            {customerInsights.communicationStyle && (
              <div className="order-details__info-section">
                <div className="order-details__info-label">💬 Communication Style</div>
                <div className="order-details__info-text order-details__info-text--insight">
                  {customerInsights.communicationStyle}
                </div>
              </div>
            )}
            {customerInsights.currentOrder && (
              <div className="order-details__info-section">
                <div className="order-details__info-label">📋 Current Order Context</div>
                <div className="order-details__info-text order-details__info-text--insight">
                  {customerInsights.currentOrder}
                </div>
              </div>
            )}
            {customerInsights.deliveryAddress && (
              <div className="order-details__info-section">
                <div className="order-details__info-label">🏠 Delivery Address (from insights)</div>
                <div className="order-details__info-text order-details__info-text--insight">
                  {customerInsights.deliveryAddress}
                </div>
              </div>
            )}
            {customerInsights.deliveryInstructions && (
              <div className="order-details__info-section">
                <div className="order-details__info-label">📮 Delivery Instructions (from insights)</div>
                <div className="order-details__info-text order-details__info-text--insight">
                  {customerInsights.deliveryInstructions}
                </div>
              </div>
            )}
            {customerInsights.specialRequests && (
              <div className="order-details__info-section">
                <div className="order-details__info-label">🎯 Special Requests (from insights)</div>
                <div className="order-details__info-text order-details__info-text--insight">
                  {customerInsights.specialRequests}
                </div>
              </div>
            )}
            {customerInsights.lastUpdated && (
              <div className="order-details__info-section">
                <div className="order-details__info-label order-details__info-text--muted">
                  Last updated: {new Date(customerInsights.lastUpdated).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Items Table */}
      <div className="order-details__card">
        <div className="order-details__card-header">
          <h3 className="order-details__card-title">Order Items</h3>
        </div>
        <table className="order-details__items-table">
          <thead className="order-details__table-header">
            <tr>
              <th className="order-details__table-header-cell">Product</th>
              <th className="order-details__table-header-cell">Quantity</th>
              <th className="order-details__table-header-cell">Unit Price</th>
              <th className="order-details__table-header-cell">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, index: number) => (
              <tr key={index} className="order-details__table-row">
                <td className="order-details__table-cell">
                  <div className="order-details__item-info">
                    <div className="order-details__item-image">📦</div>
                    <div className="order-details__item-details">
                      <div className="order-details__item-name">{item.product}</div>
                    </div>
                  </div>
                </td>
                <td className="order-details__table-cell">{item.quantity}</td>
                <td className="order-details__table-cell">{formatCurrency(item.unitPrice)}</td>
                <td className="order-details__table-cell">{formatCurrency(item.totalPrice)}</td>
              </tr>
            ))}
            <tr className="order-details__total-row">
              <td className="order-details__table-cell" colSpan={3}>Total Amount</td>
              <td className="order-details__table-cell">{formatCurrency(order.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payment & Delivery Info */}
      <div className="order-details__payment-delivery">
        <div className="order-details__card order-details__payment-card">
          <div className="order-details__card-header">
            <h3 className="order-details__card-title">Payment Information</h3>
          </div>
          <div className="order-details__payment-icon">💳</div>
          <div className="order-details__info-row">
            <span className="order-details__label">Method:</span>
            <span className="order-details__text">{mockData.payment.method}</span>
          </div>
          <div className="order-details__info-row">
            <span className="order-details__label">Transaction ID:</span>
            <span className="order-details__text order-details__text--muted">{mockData.payment.transactionId}</span>
          </div>
          <div className="order-details__info-row">
            <span className="order-details__label">Status:</span>
            <span className={`order-details__status-badge order-details__status-badge--${mockData.payment.status.toLowerCase()}`}>
              {mockData.payment.status}
            </span>
          </div>
        </div>

        <div className="order-details__card order-details__delivery-card">
          <div className="order-details__card-header">
            <h3 className="order-details__card-title">Delivery Information</h3>
          </div>
          <div className="order-details__delivery-icon">🚚</div>
          <div className="order-details__info-row">
            <span className="order-details__label">Partner:</span>
            <span className="order-details__text">{mockData.delivery.partner}</span>
          </div>
          <div className="order-details__info-row">
            <span className="order-details__label">Tracking ID:</span>
            <span className="order-details__text order-details__text--muted">{mockData.delivery.trackingId}</span>
          </div>
          {order.estimatedDelivery && (
            <div className="order-details__info-row">
              <span className="order-details__label">Estimated Delivery:</span>
              <span className="order-details__text">
                {formatDeliveryDateTime(order.estimatedDelivery)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Customer Notes Section */}
      <div className="order-details__card order-details__notes">
        <div className="order-details__card-header">
          <h3 className="order-details__card-title">Customer Notes</h3>
        </div>
        <textarea
          value={editableNotes}
          onChange={(e) => setEditableNotes(e.target.value)}
          placeholder="Any notes or modifications from the customer..."
          className="order-details__notes-textarea"
          rows={3}
        />
        <button
          onClick={handleNotesSave}
          disabled={isSavingNotes}
          className="order-details__save-btn"
        >
          {isSavingNotes ? 'Saving...' : '💾 Save Notes'}
        </button>
      </div>

      {/* Conversation Messages */}
      {order.conversation && order.conversation.messages && order.conversation.messages.length > 0 && (
        <div className="order-details__card order-details__conversation-panel">
          <div className="order-details__card-header">
            <h3 className="order-details__card-title">Conversation History</h3>
            <span className="order-details__message-count">{order.conversation.messages.length} messages</span>
          </div>
          <div className="order-details__messages-container">
            {order.conversation.messages.slice(-10).map((message: any, index: number) => (
              <div 
                key={index} 
                className={`order-details__message order-details__message--${message.senderType}`}
              >
                <div className="order-details__message-header">
                  <span className="order-details__message-sender">
                    {message.senderType === 'customer' ? '👤 Customer' : '🤖 AI Bot'}
                  </span>
                  <span className="order-details__message-time">
                    {new Date(message.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="order-details__message-content">
                  {message.content}
                </div>
              </div>
            ))}
            {order.conversation.messages.length > 10 && (
              <div className="order-details__messages-more">
                Showing last 10 of {order.conversation.messages.length} messages
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <div className="order-details__card">
        <div className="order-details__card-header">
          <h3 className="order-details__card-title">Order Timeline</h3>
        </div>
        <div className="order-details__timeline">
          {timelineEvents.map((event, index) => (
            <div 
              key={index} 
              className={`order-details__timeline-item order-details__timeline-item--${event.status}`}
            >
              <div className="order-details__timeline-content">
                <div className="order-details__timeline-header">
                  <span className="order-details__timeline-icon">{event.icon}</span>
                  <span className="order-details__timeline-label">{event.label}</span>
                </div>
                <div className="order-details__timeline-time">
                  {(event as any).formattedTime || new Date(event.timestamp).toLocaleString()}
                </div>
                {event.reason && (
                  <div className="order-details__timeline-reason">
                    Reason: {event.reason}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="order-details__actions">
        {getActionButtons()}
      </div>
    </div>
  )
}
