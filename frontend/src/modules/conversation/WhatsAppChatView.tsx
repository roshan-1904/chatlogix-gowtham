import React, { useState, useEffect, useRef } from 'react'
import { Bot, Send, Phone, MessageCircle, Clock, ArrowLeft } from 'lucide-react'
import { MobileChatHeader } from '../common/MobileChatHeader'
import { MobileConversationList } from '../common/MobileConversationList'
import { useApiClient } from '../../lib/apiClient'
import { useAuth } from '../auth/AuthContext'

type Message = {
  id: string
  senderType: 'customer' | 'assistant'
  content: string
  type: 'text' | 'audio' | 'image' | 'document'
  timestamp: string
}

type Conversation = {
  id: string
  vendorId: string
  customerId: string
  status: string
  messages: Message[]
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

type Vendor = {
  id: string
  businessName: string
  subscriptionPlan: string
  walletBalance: number
  aiBotName?: string
  aiGreeting?: string
}

interface WhatsAppChatViewProps {
  conversationTrigger?: boolean
  onConversationTriggered?: () => void
  onMobileNavToggle?: () => void
}

export function WhatsAppChatView({ conversationTrigger, onConversationTriggered, onMobileNavToggle }: WhatsAppChatViewProps = {}) {
  const api = useApiClient()
  const { user } = useAuth()
  const isAdmin = user?.roles.includes('admin')
  const vendorIdFromUser = user?.vendorId || null
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  const [showConversationList, setShowConversationList] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load vendors on component mount
  useEffect(() => {
    if (!user) return

    loadVendors()
    checkMobileView()

    const handleResize = () => {
      checkMobileView()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [user])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [selectedConversation?.messages])

  // Handle conversation trigger from mobile navigation
  useEffect(() => {
    if (conversationTrigger && isMobileView) {
      setShowConversationList(true)
      onConversationTriggered?.()
    }
  }, [conversationTrigger, isMobileView, onConversationTriggered])

  // Add/remove body class for conversation details view
  useEffect(() => {
    if (selectedConversation) {
      document.body.classList.add('conversation-details-active')
    } else {
      document.body.classList.remove('conversation-details-active')
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('conversation-details-active')
    }
  }, [selectedConversation])

  const checkMobileView = () => {
    setIsMobileView(window.innerWidth <= 767)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadVendors = async () => {
    try {
      if (isAdmin) {
        const data = await api.get<Vendor[]>('/api/vendors')
        if (Array.isArray(data)) {
          setVendors(data)
          if (data.length > 0) {
            setSelectedVendor(data[0])
            await loadConversations(data[0].id)
          }
        }
      } else if (vendorIdFromUser) {
        const config = await api.get<{
          id: string
          businessName: string
          plan: string
          walletBalance: number
          ai?: { botName?: string; greeting?: string }
        }>(`/api/vendors/${vendorIdFromUser}/config`)

        if (config) {
          const vendor: Vendor = {
            id: config.id,
            businessName: config.businessName,
            subscriptionPlan: config.plan,
            walletBalance: config.walletBalance,
            aiBotName: config.ai?.botName,
            aiGreeting: config.ai?.greeting
          }
          setVendors([vendor])
          setSelectedVendor(vendor)
          await loadConversations(vendor.id)
        }
      } else {
        setError('No vendor assigned to this account')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load vendors')
      console.error('Error loading vendors:', err)
    }
  }

  const loadConversations = async (vendorId: string) => {
    setIsLoading(true)
    setError('')
    try {
      const data = await api.get<Conversation[]>(`/api/vendors/${vendorId}/conversations`)
      if (Array.isArray(data)) {
        setConversations(data)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load conversations')
      console.error('Error loading conversations:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const messages = await api.get<Message[]>(`/api/conversations/${conversationId}/messages`)
      if (Array.isArray(messages)) {
        setSelectedConversation(prev => (prev ? { ...prev, messages } : null))
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const handleVendorChange = async (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId)
    setSelectedVendor(vendor || null)
    setSelectedConversation(null) // Clear selected conversation when vendor changes
    setConversations([]) // Clear conversations while loading
    if (vendor) {
      await loadConversations(vendor.id)
    }
  }

  const handleConversationSelect = async (conversation: Conversation) => {
    setSelectedConversation(conversation)
    await loadConversationMessages(conversation.id)
    
    // On mobile, hide conversation list and show chat
    if (isMobileView) {
      setShowConversationList(false)
    }
  }

  const handleBackToConversations = () => {
    setShowConversationList(true)
    setSelectedConversation(null)
  }

  const handleBackToMain = () => {
    setShowConversationList(false)
    setSelectedConversation(null)
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || isSendingMessage) return

    const messageToSend = newMessage.trim()
    setNewMessage('')
    setError('')
    setIsSendingMessage(true)

    try {
      await api.post('/api/conversations/test/message', {
        conversationId: selectedConversation.id,
        message: messageToSend,
        senderType: 'customer'
      })

      await loadConversationMessages(selectedConversation.id)
      if (selectedVendor) {
        await loadConversations(selectedVendor.id)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send message')
      console.error('Error sending message:', err)
    } finally {
      setIsSendingMessage(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

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

  // Mobile view - show conversation list or chat
  if (isMobileView) {
    if (showConversationList) {
      return (
        <div className="mobile-conversation-list">
          {/* Header */}
          <div className="mobile-list-header">
            <button
              onClick={handleBackToMain}
              className="mobile-back-button"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="mobile-list-title">Conversations</h2>
          </div>

          {/* Vendor Selection */}
          {vendors.length > 0 && (
            <div className="mobile-vendor-selection">
              <select 
                value={selectedVendor?.id || ''} 
                onChange={(e) => handleVendorChange(e.target.value)}
                className="mobile-vendor-select"
                disabled={isLoading}
              >
                {vendors.map(vendor => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.businessName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Conversations List */}
          <div className="mobile-conversations-container">
            {isLoading ? (
              <div className="mobile-loading-state">
                <div className="spinner"></div>
                <p>Loading conversations...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="mobile-empty-state">
                <div className="mobile-empty-icon">
                  <MessageCircle size={32} />
                </div>
                <p>No conversations found</p>
                <p>Select a vendor to view conversations</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => handleConversationSelect(conversation)}
                  className={`mobile-conversation-item ${selectedConversation?.id === conversation.id ? 'active' : ''}`}
                >
                  <div className="mobile-conversation-avatar">
                    {getConversationTitle(conversation).charAt(0).toUpperCase()}
                  </div>
                  <div className="mobile-conversation-content">
                    <div className="mobile-conversation-title">
                      <Phone size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle', opacity: 0.6 }} />
                      {getConversationTitle(conversation)}
                    </div>
                    <div className="mobile-conversation-preview">
                      <span className="emoji">💬</span> {getLastMessage(conversation)}
                    </div>
                    <div className="mobile-conversation-time">
                      <Clock size={12} style={{ marginRight: '0.25rem' }} />
                      {formatTime(conversation.updatedAt)}
                    </div>
                  </div>
                  <div className="mobile-conversation-meta">
                    <div className="mobile-message-count">
                      {conversation.messages?.length || 0}
                    </div>
                    {conversation.messages && conversation.messages.length > 0 && (
                      <div className="mobile-unread-indicator"></div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )
    }

    if (selectedConversation) {
      return (
        <div className="mobile-chat-fullscreen conversation-details-view">
          <MobileChatHeader
            title={getConversationTitle(selectedConversation)}
            subtitle={`${selectedVendor?.businessName} • ${selectedConversation.messages?.length || 0} messages`}
            onBack={handleBackToConversations}
            vendors={[]}
            selectedVendor={null}
            onVendorChange={undefined}
          />
          
          {/* Messages Area */}
          <div className="messages-area mobile-messages-area">
            {selectedConversation.messages && selectedConversation.messages.length > 0 ? (
              selectedConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={`message-container ${message.senderType === 'customer' ? 'customer' : 'assistant'}`}
                >
                  {message.senderType === 'assistant' && (
                    <div className="message-avatar">
                      <Bot size={16} />
                    </div>
                  )}
                  <div className={`message-bubble ${message.senderType === 'customer' ? 'customer' : 'assistant'}`}>
                    <div className="message-content">
                      {message.content}
                    </div>
                    <div className="message-time">
                      {new Date(message.timestamp).toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: true 
                      })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <MessageCircle size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                <p>No messages in this conversation</p>
              </div>
            )}
            {isSendingMessage && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-start',
                marginBottom: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <div className="avatar avatar-sm" style={{
                    marginRight: '0.5rem',
                    marginBottom: '0.25rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  }}>
                    <Bot size={12} />
                  </div>
                  <div className="message-bubble message-bubble-assistant mobile-message-bubble" style={{
                    color: '#64748b',
                    fontStyle: 'italic'
                  }}>
                    <div className="loading-dots">AI is typing</div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Area */}
          <div className="message-input-area mobile-message-input-area">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              disabled={isSendingMessage}
              className="message-input mobile-message-input"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || isSendingMessage}
              className="send-button mobile-send-button"
            >
              {isSendingMessage ? (
                <div className="loading-dots" style={{ fontSize: '0.75rem' }}>⏳</div>
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </div>
      )
    }

    // Mobile view - no conversation selected, show conversation list trigger
    return (
      <div style={{ padding: '1rem' }}>
        {/* Vendor Selection */}
        {vendors.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '600',
              color: '#1e293b',
              fontSize: '0.9rem'
            }}>
              Select Vendor:
            </label>
            <select 
              value={selectedVendor?.id || ''} 
              onChange={(e) => handleVendorChange(e.target.value)}
              className="input"
              style={{ width: '100%' }}
              disabled={isLoading}
            >
              {vendors.map(vendor => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.businessName}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <div 
          className="mobile-conversation-trigger"
          onClick={() => setShowConversationList(true)}
        >
          <div className="mobile-conversation-trigger-title">
            <MessageCircle size={20} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            Ongoing Conversations
          </div>
          <div className="mobile-conversation-trigger-subtitle">
            {conversations.length} conversations available • Tap to view
          </div>
        </div>
        
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}
        
        <div className="empty-state style2" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '2rem',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '1rem',
          margin: '1rem'
        }}>
          <div style={{
            position: 'relative',
            marginBottom: '2rem'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(59, 130, 246, 0.3)',
              marginBottom: '1rem'
            }}>
              <MessageCircle size={60} style={{ color: 'white' }} />
            </div>
            <div style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 16px rgba(16, 185, 129, 0.4)'
            }}>
              <span style={{ color: 'white', fontSize: '14px' }}>💬</span>
            </div>
          </div>
          
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            color: '#1e293b',
            marginBottom: '0.75rem',
            textAlign: 'center'
          }}>Select a conversation</h3>
          
          <p style={{
            color: '#64748b',
            fontSize: '1rem',
            textAlign: 'center',
            marginBottom: '2rem',
            lineHeight: '1.6',
            maxWidth: '400px'
          }}>Choose a conversation from the sidebar to view and manage messages</p>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2rem',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '2rem',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                background: '#3b82f6',
                borderRadius: '50%',
                animation: 'pulse 2s infinite'
              }}></div>
              <span style={{ color: '#3b82f6', fontSize: '0.875rem', fontWeight: '500' }}>Real-time messaging</span>
            </div>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '2rem',
              border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                background: '#10b981',
                borderRadius: '50%',
                animation: 'pulse 2s infinite'
              }}></div>
              <span style={{ color: '#10b981', fontSize: '0.875rem', fontWeight: '500' }}>AI-powered responses</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Desktop view - original layout
  return (
    <div className="card" style={{ 
      height: 'clamp(60vh, 80vh, 90vh)', 
      display: 'flex', 
      overflow: 'hidden',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      flexDirection: 'column'
    }}>
      {/* Responsive Layout */}
      <div className="responsive-chat-container">
      {/* Left Sidebar - Conversations List */}
        <div className="sidebar responsive-sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <h3 className="sidebar-title">
            <MessageCircle size={20} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            Ongoing Conversations
          </h3>
          <div>
            <select 
              value={selectedVendor?.id || ''} 
              onChange={(e) => handleVendorChange(e.target.value)}
              className="input"
              style={{ marginTop: '0.5rem' }}
              disabled={isLoading}
            >
              {vendors.map(vendor => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.businessName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Conversations List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div className="loading-state">
              <div className="loading-dots">Loading conversations</div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="loading-state">
              <MessageCircle size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p>No conversations found</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => handleConversationSelect(conversation)}
                className={`conversation-item ${selectedConversation?.id === conversation.id ? 'active' : ''}`}
                style={{
                  padding: '1rem',
                  borderBottom: '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: selectedConversation?.id === conversation.id 
                    ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' 
                    : 'transparent',
                  borderLeft: selectedConversation?.id === conversation.id ? '4px solid #3b82f6' : '4px solid transparent',
                  borderRadius: '0.5rem',
                  margin: '0.25rem',
                  boxShadow: selectedConversation?.id === conversation.id 
                    ? '0 4px 12px rgba(59, 130, 246, 0.15)' 
                    : 'none'
                }}
                onMouseEnter={(e) => {
                  if (selectedConversation?.id !== conversation.id) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedConversation?.id !== conversation.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="conversation-title">
                      <Phone size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle', opacity: 0.6 }} />
                      {getConversationTitle(conversation)}
                    </div>
                    <div className="conversation-preview">
                      <span className="emoji">💬</span> {getLastMessage(conversation)}
                    </div>
                    <div className="conversation-time">
                      <Clock size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                      {formatTime(conversation.updatedAt)}
                    </div>
                  </div>
                  <div style={{ 
                    marginLeft: '0.75rem',
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    fontWeight: '500'
                  }}>
                    {conversation.messages?.length || 0}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Side - Chat View */}
        <div className="responsive-chat-area" style={{ 
        backgroundColor: '#f8fafc'
      }}>
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="chat-header">
              <div className="chat-info">
                <div className="avatar avatar-md">
                  {getConversationTitle(selectedConversation).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="chat-title">
                    {getConversationTitle(selectedConversation)}
                  </div>
                  <div className="chat-subtitle">
                    <span className="emoji">🏪</span> {selectedVendor?.businessName} • {selectedConversation.messages?.length || 0} messages
                  </div>
                </div>
              </div>
              <div className="chat-status">
                <Clock size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Last seen {formatTime(selectedConversation.updatedAt)}
              </div>
            </div>

            {/* Messages Area */}
            <div className="messages-area">
              {selectedConversation.messages && selectedConversation.messages.length > 0 ? (
                selectedConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-container ${message.senderType === 'customer' ? 'customer' : 'assistant'}`}
                  >
                      {message.senderType === 'assistant' && (
                      <div className="message-avatar">
                        <Bot size={16} />
                        </div>
                      )}
                    <div className={`message-bubble ${message.senderType === 'customer' ? 'customer' : 'assistant'}`}>
                      <div className="message-content">
                        {message.content}
                        </div>
                      <div className="message-time">
                          {new Date(message.timestamp).toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: true 
                          })}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <MessageCircle size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                  <p>No messages in this conversation</p>
                </div>
              )}
              {isSendingMessage && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-start',
                  marginBottom: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <div className="avatar avatar-sm" style={{
                      marginRight: '0.5rem',
                      marginBottom: '0.25rem',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    }}>
                      <Bot size={12} />
                    </div>
                    <div className="message-bubble message-bubble-assistant" style={{
                      color: '#64748b',
                      fontStyle: 'italic'
                    }}>
                      <div className="loading-dots">AI is typing</div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Area */}
            <div className="message-input-area">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                disabled={isSendingMessage}
                className="message-input"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() || isSendingMessage}
                className="send-button"
              >
                {isSendingMessage ? (
                  <div className="loading-dots" style={{ fontSize: '0.75rem' }}>⏳</div>
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state style2" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '2rem',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            borderRadius: '1rem',
            margin: '1rem'
          }}>
            <div style={{
              position: 'relative',
              marginBottom: '2rem'
            }}>
              <div style={{
                width: '120px',
                height: '120px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 20px 40px rgba(59, 130, 246, 0.3)',
                marginBottom: '1rem'
              }}>
                <MessageCircle size={60} style={{ color: 'white' }} />
              </div>
              <div style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                width: '32px',
                height: '32px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(16, 185, 129, 0.4)'
              }}>
                <span style={{ color: 'white', fontSize: '14px' }}>💬</span>
              </div>
            </div>
            
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              color: '#1e293b',
              marginBottom: '0.75rem',
              textAlign: 'center'
            }}>Select a conversation</h3>
            
            <p style={{
              color: '#64748b',
              fontSize: '1rem',
              textAlign: 'center',
              marginBottom: '2rem',
              lineHeight: '1.6',
              maxWidth: '400px'
            }}>Choose a conversation from the sidebar to view and manage messages</p>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2rem',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '2rem',
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  background: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'pulse 2s infinite'
                }}></div>
                <span style={{ color: '#3b82f6', fontSize: '0.875rem', fontWeight: '500' }}>Real-time messaging</span>
              </div>
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '2rem',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  background: '#10b981',
                  borderRadius: '50%',
                  animation: 'pulse 2s infinite'
                }}></div>
                <span style={{ color: '#10b981', fontSize: '0.875rem', fontWeight: '500' }}>AI-powered responses</span>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
