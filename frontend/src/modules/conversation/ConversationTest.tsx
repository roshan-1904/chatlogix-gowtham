import React, { useState, useEffect, useRef } from 'react'
import { useApiClient } from '../../lib/apiClient'

type Vendor = {
  id: string
  businessName: string
  subscriptionPlan: string
  walletBalance: number
  aiBotName?: string
  aiGreeting?: string
}

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
}

export function ConversationTest() {
  const api = useApiClient()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [customerPhone, setCustomerPhone] = useState('919999999999')
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [conversationHistory, setConversationHistory] = useState<Conversation[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load vendors on component mount
  useEffect(() => {
    loadVendors()
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom()
  }, [currentConversation?.messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadVendors = async () => {
    try {
      const data = await api.get<Vendor[]>('/api/vendors')
      if (Array.isArray(data)) {
        setVendors(data)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load vendors')
      console.error('Error loading vendors:', err)
    }
  }

  const loadConversationHistory = async () => {
    if (!selectedVendor) return

    try {
      const data = await api.get<Conversation[]>(`/api/conversations/history/${selectedVendor.id}`)
      if (Array.isArray(data)) {
        setConversationHistory(data)
      }
    } catch (err) {
      console.error('Error loading conversation history:', err)
    }
  }

  const startConversation = async () => {
    if (!selectedVendor) {
      setError('Please select a vendor')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const conversation = await api.post<Conversation>('/api/conversations/test', {
        vendorId: selectedVendor.id,
        customerPhone: customerPhone
      })

      if (conversation) {
        setCurrentConversation(conversation)
        await loadMessages(conversation.id)
        await loadConversationHistory()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start conversation')
      console.error('Error starting conversation:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const messages = await api.get<Message[]>(`/api/conversations/${conversationId}/messages`)
      if (Array.isArray(messages)) {
        setCurrentConversation(prev => (prev ? { ...prev, messages } : null))
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentConversation) return

    const messageToSend = newMessage.trim()
    setNewMessage('')
    setIsLoading(true)

    try {
      await api.post('/api/conversations/test/message', {
        conversationId: currentConversation.id,
        message: messageToSend,
        senderType: 'customer'
      })

      await loadMessages(currentConversation.id)
    } catch (err) {
      setError('Error sending message')
      console.error('Error sending message:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const resetConversation = () => {
    setCurrentConversation(null)
    setNewMessage('')
    setError('')
  }

  return (
    <div style={{ 
      maxWidth: '100%', 
      margin: '0 auto', 
      padding: '1rem'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <h2 style={{ 
          margin: 0, 
          color: '#333',
          fontSize: 'clamp(1.25rem, 3vw, 1.5rem)'
        }}>Create New Conversation</h2>
        {selectedVendor && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="btn btn-secondary"
            style={{
              fontSize: '0.9rem',
              padding: '0.5rem 1rem'
            }}
          >
            {showHistory ? 'Hide History' : 'Show History'}
          </button>
        )}
      </div>
      
      {error && (
        <div style={{ 
          background: '#fee', 
          color: '#c33', 
          padding: '12px', 
          borderRadius: '6px', 
          marginBottom: '20px',
          border: '1px solid #fcc',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      <div className="conversation-test-container">
        {/* Main conversation area */}
        <div className="conversation-main-area">

          {!currentConversation ? (
            <div style={{ 
              background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', 
              padding: '30px', 
              borderRadius: '12px',
              marginBottom: '20px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#495057' }}>Start a Test Conversation</h3>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#495057' }}>
                  Select Vendor:
                </label>
                <select 
                  value={selectedVendor?.id || ''} 
                  onChange={(e) => {
                    const vendor = vendors.find(v => v.id === e.target.value)
                    setSelectedVendor(vendor || null)
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '12px', 
                    borderRadius: '8px',
                    border: '2px solid #dee2e6',
                    fontSize: '14px',
                    background: 'white'
                  }}
                >
                  <option value="">Choose a vendor...</option>
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.businessName} ({vendor.subscriptionPlan}) - ₹{vendor.walletBalance}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#495057' }}>
                  Customer Phone Number:
                </label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g., 919999999999"
                  style={{ 
                    width: '100%', 
                    padding: '12px', 
                    borderRadius: '8px',
                    border: '2px solid #dee2e6',
                    fontSize: '14px',
                    background: 'white'
                  }}
                />
              </div>

              <button 
                onClick={startConversation}
                disabled={!selectedVendor || isLoading}
                style={{
                  background: selectedVendor && !isLoading ? 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  cursor: selectedVendor && !isLoading ? 'pointer' : 'not-allowed',
                  fontSize: '16px',
                  fontWeight: '600',
                  boxShadow: selectedVendor && !isLoading ? '0 4px 12px rgba(0,123,255,0.3)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {isLoading ? 'Starting...' : 'Start Conversation'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '20px',
                padding: '15px',
                background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                borderRadius: '10px',
                border: '1px solid #90caf9'
              }}>
                <div>
                  <strong style={{ color: '#1565c0', fontSize: '16px' }}>
                    {selectedVendor?.businessName}
                  </strong>
                  {selectedVendor?.aiBotName && (
                    <span style={{ color: '#1976d2', marginLeft: '8px' }}>
                      ({selectedVendor.aiBotName})
                    </span>
                  )}
                  <br />
                  <small style={{ color: '#424242' }}>Customer: {customerPhone}</small>
                </div>
                <button 
                  onClick={resetConversation}
                  style={{
                    background: 'linear-gradient(135deg, #6c757d 0%, #495057 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  New Conversation
                </button>
              </div>

              <div style={{ 
                height: '450px', 
                border: '2px solid #e9ecef', 
                borderRadius: '12px',
                padding: '20px',
                overflowY: 'auto',
                background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
                marginBottom: '20px',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
              }}>
                {currentConversation.messages.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    color: '#6c757d', 
                    fontStyle: 'italic',
                    marginTop: '80px',
                    fontSize: '16px'
                  }}>
                    {selectedVendor?.aiGreeting || 'Start the conversation by sending a message!'}
                  </div>
                ) : (
                  currentConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        marginBottom: '15px',
                        display: 'flex',
                        justifyContent: message.senderType === 'customer' ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '75%',
                          padding: '12px 16px',
                          borderRadius: '20px',
                          background: message.senderType === 'customer' 
                            ? 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)' 
                            : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                          color: message.senderType === 'customer' ? 'white' : '#333',
                          wordWrap: 'break-word',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          border: message.senderType === 'customer' ? 'none' : '1px solid #dee2e6'
                        }}
                      >
                        <div style={{ fontSize: '14px', lineHeight: '1.4' }}>{message.content}</div>
                        <div style={{ 
                          fontSize: '11px', 
                          opacity: 0.7, 
                          marginTop: '6px',
                          textAlign: message.senderType === 'customer' ? 'right' : 'left'
                        }}>
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'flex-start',
                    marginBottom: '15px'
                  }}>
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '20px',
                      background: 'linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%)',
                      color: '#6c757d',
                      fontStyle: 'italic',
                      fontSize: '14px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                      AI is thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: '25px',
                    border: '2px solid #dee2e6',
                    outline: 'none',
                    fontSize: '14px',
                    background: 'white'
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || isLoading}
                  style={{
                    background: newMessage.trim() && !isLoading 
                      ? 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)' 
                      : '#6c757d',
                    color: 'white',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '25px',
                    cursor: newMessage.trim() && !isLoading ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: '600',
                    boxShadow: newMessage.trim() && !isLoading ? '0 4px 12px rgba(40,167,69,0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Conversation History Panel */}
        {showHistory && selectedVendor && (
          <div className="conversation-history-panel card" style={{ 
            background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
            maxHeight: '600px',
            overflowY: 'auto'
          }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#495057' }}>Conversation History</h4>
            {conversationHistory.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                color: '#6c757d', 
                fontStyle: 'italic',
                marginTop: '20px'
              }}>
                No previous conversations
              </div>
            ) : (
              conversationHistory.map((conv) => (
                <div
                  key={conv.id}
                  style={{
                    background: 'white',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '10px',
                    border: '1px solid #dee2e6',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => {
                    setCurrentConversation(conv)
                    loadMessages(conv.id)
                  }}
                >
                  <div style={{ fontWeight: '600', color: '#495057', fontSize: '14px' }}>
                    {conv.customerId}
                  </div>
                  <div style={{ color: '#6c757d', fontSize: '12px', marginTop: '4px' }}>
                    {conv.messages.length} messages
                  </div>
                  <div style={{ color: '#6c757d', fontSize: '11px', marginTop: '2px' }}>
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
