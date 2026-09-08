const vendorOrigin = (
  import.meta.env.VITE_VENDOR_APP_ORIGIN
  ?? (import.meta.env.PROD ? 'https://app.chatlogix.in' : 'http://127.0.0.1:3000')
).replace(/\/$/, '');

const siteOrigin = (
  import.meta.env.VITE_SITE_ORIGIN
  ?? (import.meta.env.PROD ? 'https://www.chatlogix.in' : 'http://127.0.0.1:3002')
).replace(/\/$/, '');

const supportWhatsApp = import.meta.env.VITE_SUPPORT_WHATSAPP?.trim() ?? '';

export const site = {
  vendorOrigin,
  siteOrigin,
  supportWhatsApp,
  urls: {
    home: siteOrigin,
    tryFree: `${vendorOrigin}/signup`,
    login: `${vendorOrigin}/login`,
    privacy: `${siteOrigin}/privacy`,
    about: `${siteOrigin}/about`,
    terms: `${siteOrigin}/terms`,
    talkToUs: supportWhatsApp
      ? `https://wa.me/${supportWhatsApp.replace(/\D/g, '')}`
      : null,
  },
} as const;

export const navLinks = [
  { label: 'Product', href: '/#product' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'FAQ', href: '/#faq' },
] as const;

export const socialLinks = [
  { id: 'x' as const, label: 'X', href: 'https://x.com/chatlogix' },
  { id: 'youtube' as const, label: 'YouTube', href: 'https://youtube.com/chatlogix' },
  { id: 'linkedin' as const, label: 'LinkedIn', href: 'https://www.linkedin.com/company/chatlogix' },
  { id: 'instagram' as const, label: 'Instagram', href: 'https://www.instagram.com/chatlogix' },
  { id: 'facebook' as const, label: 'Facebook', href: 'https://facebook.com/groups/chatlogix' },
] as const;
