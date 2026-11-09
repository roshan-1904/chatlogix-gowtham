import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationList, type ConversationFilters } from '../ConversationList';
import type { Conversation } from '../types';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'list.title': 'Chats',
        'list.searchPlaceholder': 'Search or start new chat',
        'list.empty': 'No conversations found',
        'list.noMessages': 'No messages yet',
      };
      return translations[key] ?? key;
    },
  }),
}));

describe('ConversationList Search & Filter', () => {
  const mockConversations: Conversation[] = [
    {
      id: 'conv-1',
      vendorId: 'vendor-1',
      customerId: 'cust-1',
      status: 'active',
      aiPaused: false,
      updatedAt: '2026-11-09T10:00:00Z',
      createdAt: '2026-11-09T08:00:00Z',
      customerName: 'Priya Sharma',
      customer: {
        id: 'cust-1',
        phone: '+919876543210',
      },
      lastMessage: {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderType: 'customer',
        senderId: 'cust-1',
        content: 'Is fresh milk available?',
        type: 'text',
        status: 'delivered',
        timestamp: '2026-11-09T10:00:00Z',
      },
    },
    {
      id: 'conv-2',
      vendorId: 'vendor-1',
      customerId: 'cust-2',
      status: 'active',
      aiPaused: true,
      updatedAt: '2026-11-09T09:30:00Z',
      createdAt: '2026-11-09T07:00:00Z',
      customerName: 'Rajesh Patel',
      customer: {
        id: 'cust-2',
        phone: '+919876543211',
      },
      lastMessage: {
        id: 'msg-2',
        conversationId: 'conv-2',
        senderType: 'customer',
        senderId: 'cust-2',
        content: 'Need to cancel my order',
        type: 'text',
        status: 'read',
        timestamp: '2026-11-09T09:30:00Z',
      },
    },
  ];

  const defaultProps = {
    conversations: mockConversations,
    selectedConversationId: null,
    searchQuery: '',
    onSearchChange: vi.fn(),
    onSelectConversation: vi.fn(),
    isRefreshing: false,
    onRefresh: vi.fn(),
    error: null,
    hasMore: false,
    isLoadingMore: false,
    onLoadMore: vi.fn(),
    filters: {
      aiPauseStatus: 'all' as const,
      hasOrder: 'all' as const,
      customerType: 'all' as const,
    },
    onFiltersChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders conversations list with titles, timestamps, and messages', () => {
    render(<ConversationList {...defaultProps} />);

    expect(screen.getByText('Chats')).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('Is fresh milk available?')).toBeInTheDocument();
    expect(screen.getByText('Rajesh Patel')).toBeInTheDocument();
    expect(screen.getByText('Need to cancel my order')).toBeInTheDocument();
  });

  it('renders search input and calls onSearchChange on typing', () => {
    render(<ConversationList {...defaultProps} />);

    const searchInput = screen.getByLabelText(/Search conversations by name or phone/i);
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Priya' } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('Priya');
  });

  it('renders Clear button when searchQuery is active and clears search on click', () => {
    render(<ConversationList {...defaultProps} searchQuery="Priya" />);

    const clearButton = screen.getByRole('button', { name: /Clear/i });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('');
  });

  it('renders quick filter chips: All, AI Paused, Orders, New', () => {
    render(<ConversationList {...defaultProps} />);

    expect(screen.getByRole('button', { name: /^All$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AI Paused/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Orders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
  });

  it('clicking AI Paused quick chip toggles aiPauseStatus filter', () => {
    render(<ConversationList {...defaultProps} />);

    const aiPausedButton = screen.getByRole('button', { name: /AI Paused/i });
    fireEvent.click(aiPausedButton);

    expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
      aiPauseStatus: 'paused',
      hasOrder: 'all',
      customerType: 'all',
    });
  });

  it('clicking Orders quick chip toggles hasOrder filter', () => {
    render(<ConversationList {...defaultProps} />);

    const ordersButton = screen.getByRole('button', { name: /Orders/i });
    fireEvent.click(ordersButton);

    expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
      aiPauseStatus: 'all',
      hasOrder: 'yes',
      customerType: 'all',
    });
  });

  it('clicking All chip resets all filters to default', () => {
    const activeFilters: ConversationFilters = {
      aiPauseStatus: 'paused',
      hasOrder: 'yes',
      customerType: 'new',
    };
    render(<ConversationList {...defaultProps} filters={activeFilters} />);

    const allButton = screen.getByRole('button', { name: /^All$/i });
    fireEvent.click(allButton);

    expect(defaultProps.onFiltersChange).toHaveBeenCalledWith({
      aiPauseStatus: 'all',
      hasOrder: 'all',
      customerType: 'all',
    });
  });

  it('calls onSelectConversation when clicking a conversation item', () => {
    render(<ConversationList {...defaultProps} />);

    const firstItem = screen.getByText('Priya Sharma');
    fireEvent.click(firstItem);

    expect(defaultProps.onSelectConversation).toHaveBeenCalledWith(mockConversations[0]);
  });

  it('renders empty state when there are no conversations', () => {
    render(<ConversationList {...defaultProps} conversations={[]} />);

    expect(screen.getByText('No conversations found')).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    render(
      <ConversationList
        {...defaultProps}
        conversations={[]}
        error="Failed to load conversations"
      />
    );

    expect(screen.getByText('Failed to load conversations')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    expect(defaultProps.onRefresh).toHaveBeenCalled();
  });
});

