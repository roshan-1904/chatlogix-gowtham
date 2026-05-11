import React, { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { LoginPage } from '../auth/LoginPage'
import { ConversationTest } from '../conversation/ConversationTest'
import { WhatsAppChatView } from '../conversation/WhatsAppChatView'
import { OrderManagement } from '../orders/OrderManagement'
import { OrderDetailsPage } from '../orders/OrderDetailsPage'
import { MobileNavigation } from '../common/MobileNavigation'
import { PrivacyPolicy } from '../common/PrivacyPolicy'
import '../../styles/global.css'

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
        color: '#fff',
        fontSize: '1.25rem',
        fontWeight: 600
      }}
    >
      Preparing your workspace...
    </div>
  )
}

export function App() {
  const { token, user, isInitialized, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<'conversation' | 'whatsapp' | 'orders' | 'privacy'>('whatsapp')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const isAdmin = user?.roles.includes('admin')
  const isVendor = user?.roles.includes('vendor')

  useEffect(() => {
    if (!user) return
    if (user.roles.includes('vendor')) {
      setActiveTab('whatsapp')
    }
  }, [user])

  // Handle URL-based routing
  useEffect(() => {
    if (!isInitialized) {
      return
    }

    const path = window.location.pathname
    if (path === '/privacy') {
      setActiveTab('privacy')
    } else if (path === '/conversation') {
      setActiveTab('conversation')
    } else if (path === '/orders') {
      setActiveTab('orders')
    } else if (path.startsWith('/orders/')) {
      const orderId = path.split('/')[2]
      setActiveTab('orders')
      setSelectedOrderId(orderId)
    } else {
      setActiveTab('whatsapp')
    }
  }, [isInitialized])

  if (!isInitialized) {
    return <LoadingScreen />
  }

  if (!token || !user) {
    return <LoginPage />
  }

  const handleTabChange = (tab: 'conversation' | 'whatsapp' | 'orders' | 'privacy') => {
    if (!isAdmin && tab === 'conversation') {
      return
    }
    setActiveTab(tab)
    setIsMobileNavOpen(false)
    setSelectedOrderId(null)
    
    // Update URL without page reload
    const path = tab === 'whatsapp' ? '/' : `/${tab}`
    window.history.pushState({}, '', path)
  }

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId)
    window.history.pushState({}, '', `/orders/${orderId}`)
  }

  const handleBackToOrders = () => {
    setSelectedOrderId(null)
    window.history.pushState({}, '', '/orders')
  }

  const handleMobileNavToggle = () => {
    setIsMobileNavOpen(!isMobileNavOpen)
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      padding: '1rem',
      position: 'relative'
    }}>
      {/* Mobile Navigation */}
      <MobileNavigation
        activeTab={
          // Only pass allowed tabs per MobileNavigation's type
          activeTab === 'privacy' ? 'whatsapp' : activeTab
        }
        showConversationTab={Boolean(isAdmin)}
        onTabChange={tab =>
          // Only allow changing to supported tabs from mobile nav
          handleTabChange(tab)
        }
        onClose={() => setIsMobileNavOpen(false)}
        isOpen={isMobileNavOpen}
        onToggle={handleMobileNavToggle}
      />

      {/* Header */}
      <div style={{ 
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        <h1 style={{ 
          fontSize: 'clamp(1.5rem, 4vw, 3rem)',
          fontWeight: '700',
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.5rem',
          letterSpacing: '-0.025em'
        }}>
          ChatLogix
        </h1>
        <p style={{ 
          color: '#64748b',
          fontSize: 'clamp(0.9rem, 2.5vw, 1.125rem)',
          fontWeight: '400'
        }}>
          WhatsApp Commerce Management Platform
        </p>
      </div>
      <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
        <button
          onClick={logout}
          style={{
            background: '#1e293b',
            color: '#fff',
            border: 'none',
            borderRadius: '999px',
            padding: '0.5rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 10px 25px -15px rgba(15, 23, 42, 0.6)'
          }}
        >
          Sign out
        </button>
      </div>
      
      {/* Desktop Navigation Tabs */}
      <div className="tab-container">
        {isAdmin && (
          <button
            onClick={() => setActiveTab('conversation')}
            className={`tab ${activeTab === 'conversation' ? 'active' : ''}`}
          >
            🧪 Create Conversation
          </button>
        )}
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`tab ${activeTab === 'whatsapp' ? 'active' : ''}`}
        >
          💬 Ongoing Conversations
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
        >
          📦 Order Management
        </button>
      </div>

            {/* Content Area */}
            <div className="fade-in main-content">
              {activeTab === 'conversation' && <ConversationTest />}
              {activeTab === 'whatsapp' && (
                <WhatsAppChatView 
                  onMobileNavToggle={handleMobileNavToggle}
                />
              )}
              {activeTab === 'orders' && !selectedOrderId && (
                <OrderManagement onOrderSelect={handleOrderSelect} />
              )}
              {activeTab === 'orders' && selectedOrderId && (
                <OrderDetailsPage 
                  orderId={selectedOrderId} 
                  onBack={handleBackToOrders}
                />
              )}
              {activeTab === 'privacy' && <PrivacyPolicy />}
            </div>

            {/* Footer */}
            <footer style={{
              marginTop: '3rem',
              padding: '1.5rem 0',
              borderTop: '1px solid #e2e8f0',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '0.875rem'
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                © 2024 ChatLogix. All rights reserved.
              </div>
              <div>
                <button
                  onClick={() => handleTabChange('privacy')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3b82f6',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Privacy Policy
                </button>
              </div>
            </footer>
    </div>
  )
}


