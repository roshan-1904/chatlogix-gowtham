import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Support } from '../Support';
import * as vendorConfigHook from '../../hooks/useVendorConfig';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../hooks/useVendorConfig', () => ({
  useVendorConfig: vi.fn(),
}));

describe('Support Page', () => {
  const origEnv = { ...import.meta.env };

  beforeEach(() => {
    vi.clearAllMocks();
    (vendorConfigHook.useVendorConfig as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: 'v_chennai_001',
        businessName: 'Ananda Bhavan Sweets',
        plan: 'pro',
      },
      isLoading: false,
    });
  });

  afterEach(() => {
    import.meta.env.VITE_SUPPORT_WHATSAPP = origEnv.VITE_SUPPORT_WHATSAPP;
    import.meta.env.VITE_SUPPORT_EMAIL = origEnv.VITE_SUPPORT_EMAIL;
  });

  it('renders page header and subtitle', () => {
    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /Support & Help/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Get direct help with your WhatsApp AI assistant/i)
    ).toBeInTheDocument();
  });

  it('renders WhatsApp and Email support cards when configured', () => {
    import.meta.env.VITE_SUPPORT_WHATSAPP = '+91 98765 43210';
    import.meta.env.VITE_SUPPORT_EMAIL = 'support@chatlogix.in';

    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    expect(screen.getByText('Chat on WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('+919876543210')).toBeInTheDocument();
    const waLink = screen.getByRole('link', { name: /Message on WhatsApp/i });
    expect(waLink).toHaveAttribute('href', 'https://wa.me/919876543210');

    expect(screen.getByText('Email Support')).toBeInTheDocument();
    expect(screen.getByText('support@chatlogix.in')).toBeInTheDocument();
    const emailLink = screen.getByRole('link', { name: /Send Email/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:support@chatlogix.in');
  });

  it('renders fallback contact page when no contact env vars are present', () => {
    delete import.meta.env.VITE_SUPPORT_WHATSAPP;
    delete import.meta.env.VITE_SUPPORT_EMAIL;

    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    expect(screen.getByText('ChatLogix Help Center')).toBeInTheDocument();
    const contactLink = screen.getByRole('link', { name: /Visit Contact Page/i });
    expect(contactLink).toHaveAttribute('href', 'https://www.chatlogix.in/contact');
  });

  it('renders all 6 self-serve quick help cards with proper links', () => {
    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /Review Queries/i })).toHaveAttribute(
      'href',
      '/queries'
    );
    expect(screen.getByRole('link', { name: /Manage Catalog/i })).toHaveAttribute(
      'href',
      '/catalog'
    );
    expect(screen.getByRole('link', { name: /Update FAQs/i })).toHaveAttribute('href', '/faqs');
    expect(screen.getByRole('link', { name: /Check Wallet Balance/i })).toHaveAttribute(
      'href',
      '/wallet'
    );
    expect(screen.getByRole('link', { name: /WhatsApp Connection/i })).toHaveAttribute(
      'href',
      '/settings/whatsapp'
    );
    expect(screen.getByRole('link', { name: /Store Settings/i })).toHaveAttribute(
      'href',
      '/settings'
    );
  });

  it('displays shop account diagnostics', () => {
    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    expect(screen.getByText('Ananda Bhavan Sweets')).toBeInTheDocument();
    expect(screen.getByText('v_chennai_001')).toBeInTheDocument();
    expect(screen.getByText('pro')).toBeInTheDocument();
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('copies diagnostics to clipboard when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    const copyBtn = screen.getByRole('button', { name: /Copy Diagnostics/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining('Vendor ID: v_chennai_001')
      );
    });

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining('Shop: Ananda Bhavan Sweets')
    );
    expect(toast.success).toHaveBeenCalledWith('Diagnostics copied to clipboard');
  });
});
