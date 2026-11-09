import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CustomerDetailsPanel } from '../CustomerDetailsPanel';
import type { Conversation, CustomerInsights, Order } from '../types';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CustomerDetailsPanel (P2.1 & P2.2)', () => {
  const mockConversation: Conversation = {
    id: 'conv-123',
    vendorId: 'v-1',
    customerId: 'cust-456',
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    customer: {
      id: 'cust-456',
      phone: '+919876543210',
    },
    lastMessage: null,
  };

  const mockInsights: CustomerInsights = {
    customerName: 'Aarav Kumar',
    email: 'aarav@example.com',
    preferredLanguage: 'ta',
    specialRequests: 'Ring the bell twice.',
    specialOccasions: 'Birthday next Tuesday',
    primaryDeliveryAddress: '123 Anna Salai, Chennai',
  };

  const mockOrders: Order[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.useFakeTimers();

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders customer insights including preferred language and special requests', () => {
    render(
      <MemoryRouter>
        <CustomerDetailsPanel
          conversation={mockConversation}
          customerInsights={mockInsights}
          customerOrders={mockOrders}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Aarav Kumar')).toBeInTheDocument();
    expect(screen.getByText('aarav@example.com')).toBeInTheDocument();
    expect(screen.getByText('Tamil')).toBeInTheDocument();
    expect(screen.getByText('Ring the bell twice.')).toBeInTheDocument();
    expect(screen.getByText('Birthday next Tuesday')).toBeInTheDocument();
  });

  it('renders vendor notes textarea and loads existing notes from localStorage (P2.1)', () => {
    window.localStorage.setItem('chatlogix:vendor_note:cust-456', 'Prefers contactless drops');

    render(
      <MemoryRouter>
        <CustomerDetailsPanel
          conversation={mockConversation}
          customerInsights={mockInsights}
          customerOrders={mockOrders}
        />
      </MemoryRouter>
    );

    const textarea = screen.getByLabelText(/Vendor notes/i) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Prefers contactless drops');
  });

  it('debounces note edits and saves them into localStorage with save status indicator (P2.1)', () => {
    render(
      <MemoryRouter>
        <CustomerDetailsPanel
          conversation={mockConversation}
          customerInsights={mockInsights}
          customerOrders={mockOrders}
        />
      </MemoryRouter>
    );

    const textarea = screen.getByLabelText(/Vendor notes/i);
    fireEvent.change(textarea, { target: { value: 'New private notes for delivery' } });

    expect(screen.getByText('Saving…')).toBeInTheDocument();

    // Fast-forward debounce timer (600ms)
    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(window.localStorage.getItem('chatlogix:vendor_note:cust-456')).toBe(
      'New private notes for delivery'
    );
    expect(screen.getByText('✓ Saved')).toBeInTheDocument();

    // Fast-forward hide status timer (2000ms)
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(screen.getByText('Private store notes')).toBeInTheDocument();
  });

  it('renders quick replies and copies text to clipboard on click (P2.2)', async () => {
    render(
      <MemoryRouter>
        <CustomerDetailsPanel
          conversation={mockConversation}
          customerInsights={mockInsights}
          customerOrders={mockOrders}
        />
      </MemoryRouter>
    );

    const firstReplyButton = screen.getByRole('button', {
      name: /Thanks for your order! It has been confirmed\./i,
    });
    expect(firstReplyButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(firstReplyButton);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'Thanks for your order! It has been confirmed.'
    );
    expect(toast.success).toHaveBeenCalledWith('Quick reply copied to clipboard');
  });

  it('handles empty customer insights without crashing', () => {
    render(
      <MemoryRouter>
        <CustomerDetailsPanel
          conversation={mockConversation}
          customerInsights={null}
          customerOrders={mockOrders}
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/Vendor notes/i)).toBeInTheDocument();
    expect(screen.getByText('Quick Replies')).toBeInTheDocument();
  });
});

