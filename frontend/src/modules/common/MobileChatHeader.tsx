import React from 'react'
import { ArrowLeft, MoreVertical, Phone, Video, Settings } from 'lucide-react'

interface MobileChatHeaderProps {
  title: string
  subtitle: string
  onBack: () => void
  onMenu?: () => void
  vendors?: Array<{ id: string; businessName: string }>
  selectedVendor?: { id: string; businessName: string } | null
  onVendorChange?: (vendorId: string) => void
}

export function MobileChatHeader({ 
  title, 
  subtitle, 
  onBack, 
  onMenu, 
  vendors = [], 
  selectedVendor, 
  onVendorChange 
}: MobileChatHeaderProps) {
  return (
    <div className="mobile-chat-header">
      <div className="mobile-chat-header-left">
        <button
          onClick={onBack}
          className="mobile-chat-back-button"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="mobile-chat-info">
          <h3 className="mobile-chat-title">{title}</h3>
          <p className="mobile-chat-subtitle">{subtitle}</p>
        </div>
      </div>
      <div className="mobile-chat-header-right">
        {vendors.length > 1 && onVendorChange && (
          <select
            value={selectedVendor?.id || ''}
            onChange={(e) => onVendorChange(e.target.value)}
            className="mobile-chat-vendor-switcher"
            aria-label="Switch vendor"
          >
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.businessName}
              </option>
            ))}
          </select>
        )}
        <button className="mobile-chat-action-button" aria-label="Voice call">
          <Phone size={18} />
        </button>
        <button className="mobile-chat-action-button" aria-label="Video call">
          <Video size={18} />
        </button>
        {onMenu && (
          <button
            onClick={onMenu}
            className="mobile-chat-action-button"
            aria-label="More options"
          >
            <MoreVertical size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
