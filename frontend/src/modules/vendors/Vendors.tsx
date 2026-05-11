import React, { useEffect, useState } from 'react'
import { useApiClient } from '../../lib/apiClient'
import { useAuth } from '../auth/AuthContext'

type Vendor = {
  id: string
  businessName: string
  subscriptionPlan: string
  walletBalance: number
}

export function Vendors() {
  const api = useApiClient()
  const { user } = useAuth()
  const isAdmin = user?.roles.includes('admin')
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [name, setName] = useState('Test Vendor')
  const [phone, setPhone] = useState('919999999999')
  const [email, setEmail] = useState('test@example.com')

  async function register() {
    const data = await api.post<Vendor>('/api/vendors/register', {
      businessName: name,
      phone,
      email,
      subscriptionPlan: 'Starter'
    })
    setVendor(data)
  }

  async function recharge() {
    if (!vendor) return
    const data = await api.post<{ walletBalance: number }>(`/api/vendors/${vendor.id}/recharge-wallet`, {
      amount: 100
    })
    setVendor({ ...(vendor as Vendor), walletBalance: data.walletBalance })
  }

  return (
    <div style={{ 
      maxWidth: '100%', 
      margin: '0 auto', 
      padding: '1rem'
    }}>
      <h2 style={{
        fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
        marginBottom: '1rem'
      }}>Vendor Onboarding</h2>
      {!isAdmin ? (
        <div className="card" style={{ padding: '1.5rem' }}>
          <p style={{ marginBottom: '0.5rem' }}>Only administrators can manage vendor onboarding.</p>
        </div>
      ) : !vendor ? (
        <div className="vendor-form">
          <input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Business Name"
            className="input"
          />
          <input 
            value={phone} 
            onChange={(e) => setPhone(e.target.value)} 
            placeholder="Phone"
            className="input"
          />
          <input 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="Email"
            className="input"
          />
          <button 
            onClick={register}
            className="btn btn-primary"
          >
            Register
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ 
            marginBottom: '1rem',
            fontSize: '1.1rem'
          }}>
            <strong>{vendor.businessName}</strong> — Plan: {vendor.subscriptionPlan} — Wallet: ₹{vendor.walletBalance}
          </div>
          <button 
            onClick={recharge}
            className="btn btn-success"
          >
            Recharge ₹100
          </button>
        </div>
      )}
    </div>
  )
}


