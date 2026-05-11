import React from 'react'
import { Phone, Clock, MessageCircle, ArrowLeft } from 'lucide-react'

interface Conversation {
  id: string
  vendorId: string
  customerId: string
  status: string
  messages: Array<{
    id: string
    senderType: 'customer' | 'assistant'
    content: string
    type: 'text' | 'audio' | 'image' | 'document'
    timestamp: string
  }>
  customer?: {
    phone: string
    name?: string
  }
  vendor?: {
    businessName: string
    aiBotName?: string
  }
  updatedAt: string
}

interface Vendor {
  id: string
  businessName: string
  subscriptionPlan: string
  walletBalance: number
  aiBotName?: string
  aiGreeting?: string
}

interface MobileConversationListProps {
  conversations: Conversation[]
  selectedConversation: Conversation | null
  onConversationSelect: (conversation: Conversation) => void
  onBack: () => void
  vendors?: Vendor[]
  selectedVendor?: Vendor | null
  onVendorChange?: (vendorId: string) => void
}

export function MobileConversationList({ 
  conversations, 
  selectedConversation, 
  onConversationSelect, 
  onBack,
  vendors = [],
  selectedVendor,
  onVendorChange
}: MobileConversationListProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
    }
  }

  const getLastMessage = (conversation: Conversation) => {
    if (conversation.messages && conversation.messages.length > 0) {
      const lastMessage = conversation.messages[conversation.messages.length - 1]
      return lastMessage.content.length > 50 
        ? lastMessage.content.substring(0, 50) + '...'
        : lastMessage.content
    }
    return 'No messages yet'
  }

  const getConversationTitle = (conversation: Conversation) => {
    if (conversation.customer?.name) {
      return conversation.customer.name
    }
    return conversation.customer?.phone || conversation.customerId
  }

  return (
    <div className="mobile-conversation-list">
      {/* Header */}
      <div className="mobile-conversation-header">
        <button
          onClick={onBack}
          className="mobile-conversation-back-button"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="mobile-conversation-title">Conversations</h2>
        <div className="mobile-conversation-spacer"></div>
      </div>

      {/* Vendor Selection */}
      {vendors.length > 0 && onVendorChange && (
        <div className="mobile-vendor-selection">
          <select 
            value={selectedVendor?.id || ''} 
            onChange={(e) => onVendorChange(e.target.value)}
            className="mobile-vendor-dropdown"
          >
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.businessName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Conversations */}
      <div className="mobile-conversation-content">
        {conversations.length === 0 ? (
          <div className="mobile-conversation-empty">
            <MessageCircle size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <p>No conversations found</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => onConversationSelect(conversation)}
              className={`mobile-conversation-item ${
                selectedConversation?.id === conversation.id ? 'active' : ''
              }`}
            >
              <div className="mobile-conversation-avatar">
                {getConversationTitle(conversation).charAt(0).toUpperCase()}
              </div>
              <div className="mobile-conversation-details">
                <div className="mobile-conversation-name">
                  <Phone size={14} style={{ marginRight: '0.25rem', opacity: 0.6 }} />
                  {getConversationTitle(conversation)}
                </div>
                <div className="mobile-conversation-preview">
                  <span className="emoji">💬</span> {getLastMessage(conversation)}
                </div>
                <div className="mobile-conversation-meta">
                  <Clock size={12} style={{ marginRight: '0.25rem' }} />
                  {formatTime(conversation.updatedAt)}
                  <span className="mobile-conversation-count">
                    {conversation.messages?.length || 0}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
