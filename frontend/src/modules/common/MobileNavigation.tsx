import React from 'react'
import { Menu, X } from 'lucide-react'

interface MobileNavigationProps {
  activeTab: 'conversation' | 'whatsapp' | 'orders'
  onTabChange: (tab: 'conversation' | 'whatsapp' | 'orders') => void
  onClose: () => void
  isOpen?: boolean
  onToggle?: () => void
  showConversationTab?: boolean
}

export function MobileNavigation({
  activeTab,
  onTabChange,
  onClose,
  isOpen = false,
  onToggle,
  showConversationTab = true
}: MobileNavigationProps) {

  const handleTabClick = (tab: 'conversation' | 'whatsapp' | 'orders') => {
    onTabChange(tab)
    onClose()
  }

  const tabs = [
    showConversationTab
      ? {
          id: 'conversation' as const,
          label: 'Create Conversation',
          emoji: '🧪'
        }
      : null,
    {
      id: 'whatsapp' as const,
      label: 'Ongoing Conversations',
      emoji: '💬'
    },
    {
      id: 'orders' as const,
      label: 'Order Management',
      emoji: '📦'
    }
  ].filter(Boolean) as Array<{
    id: 'conversation' | 'whatsapp' | 'orders'
    label: string
    emoji: string
  }>

  return (
    <>
            {/* Hamburger Menu Button */}
            <button
              onClick={onToggle}
              className="mobile-menu-button"
              aria-label="Open navigation menu"
            >
              <Menu size={24} />
            </button>

      {/* Mobile Navigation Overlay */}
      {isOpen && (
        <div className="mobile-nav-overlay">
          <div className="mobile-nav-content">
            {/* Header */}
            <div className="mobile-nav-header">
              <h2 className="mobile-nav-title">ChatLogix</h2>
            <button
              onClick={onClose}
              className="mobile-nav-close"
              aria-label="Close navigation menu"
            >
              <X size={24} />
            </button>
            </div>

            {/* Navigation Items */}
            <nav className="mobile-nav-menu">
              {tabs.map((tab) => {
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                  >
                    <div className="mobile-nav-item-content">
                      <span className="mobile-nav-emoji">{tab.emoji}</span>
                      <span className="mobile-nav-label">{tab.label}</span>
                    </div>
                    {activeTab === tab.id && (
                      <div className="mobile-nav-indicator">●</div>
                    )}
                  </button>
                )
              })}
            </nav>

            {/* Footer */}
            <div className="mobile-nav-footer">
              <p className="mobile-nav-subtitle">WhatsApp Commerce Management Platform</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
