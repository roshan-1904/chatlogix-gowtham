import { describe, it, expect } from 'vitest';
import {
  resolveSupportContact,
  getAllSupportChannels,
  formatDiagnosticsString,
} from '../support';

describe('Vendor Support Helper Unit Tests', () => {
  describe('resolveSupportContact', () => {
    it('resolves WhatsApp target when whatsapp env/arg is provided with digits', () => {
      const contact = resolveSupportContact({
        whatsapp: '+91 98765 43210',
        email: 'help@chatlogix.in',
      });
      expect(contact.type).toBe('whatsapp');
      expect(contact.href).toBe('https://wa.me/919876543210');
      expect(contact.value).toBe('+919876543210');
      expect(contact.label).toBe('WhatsApp us');
    });

    it('falls back to Email when WhatsApp is empty but email is provided', () => {
      const contact = resolveSupportContact({
        whatsapp: '',
        email: 'support@chatlogix.in',
      });
      expect(contact.type).toBe('email');
      expect(contact.href).toBe('mailto:support@chatlogix.in');
      expect(contact.value).toBe('support@chatlogix.in');
      expect(contact.label).toBe('Email us');
    });

    it('falls back to website contact page when both whatsapp and email are empty', () => {
      const contact = resolveSupportContact({
        whatsapp: '',
        email: '',
      });
      expect(contact.type).toBe('fallback');
      expect(contact.href).toBe('https://www.chatlogix.in/contact');
      expect(contact.label).toBe('Contact us');
    });
  });

  describe('getAllSupportChannels', () => {
    it('returns both whatsapp and email when both are configured', () => {
      const channels = getAllSupportChannels({
        whatsapp: '919876543210',
        email: 'support@chatlogix.in',
      });
      expect(channels.whatsapp).not.toBeNull();
      expect(channels.whatsapp?.href).toBe('https://wa.me/919876543210');
      expect(channels.whatsapp?.phone).toBe('+919876543210');

      expect(channels.email).not.toBeNull();
      expect(channels.email?.href).toBe('mailto:support@chatlogix.in');
      expect(channels.email?.email).toBe('support@chatlogix.in');

      expect(channels.fallback.href).toBe('https://www.chatlogix.in/contact');
    });

    it('returns null for unconfigured channels', () => {
      const channels = getAllSupportChannels({
        whatsapp: '',
        email: '',
      });
      expect(channels.whatsapp).toBeNull();
      expect(channels.email).toBeNull();
      expect(channels.fallback.href).toBe('https://www.chatlogix.in/contact');
    });
  });

  describe('formatDiagnosticsString', () => {
    it('formats shop diagnostics for easy copying to support', () => {
      const str = formatDiagnosticsString({
        id: 'vendor-uuid-123',
        businessName: 'Annapoorna Supermarket',
        plan: 'pro',
      });
      expect(str).toContain('Shop: Annapoorna Supermarket');
      expect(str).toContain('Vendor ID: vendor-uuid-123');
      expect(str).toContain('Plan: pro');
      expect(str).toContain('App Version: 0.1.0');
    });

    it('handles undefined vendor gracefully', () => {
      const str = formatDiagnosticsString(undefined);
      expect(str).toContain('Shop: Unknown Shop');
      expect(str).toContain('Vendor ID: —');
      expect(str).toContain('Plan: Active');
      expect(str).toContain('App Version: 0.1.0');
    });
  });
});

