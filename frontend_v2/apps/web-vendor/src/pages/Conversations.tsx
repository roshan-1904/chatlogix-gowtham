import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@chatlogix/auth';
import { apiClient } from '../lib/api';
import { ConversationList, type ConversationFilters } from '../components/conversations/ConversationList';
import { ConversationHeader } from '../components/conversations/ConversationHeader';
import { MessageList } from '../components/conversations/MessageList';
import { MessageInput } from '../components/conversations/MessageInput';
import { CustomerDetailsPanel } from '../components/conversations/CustomerDetailsPanel';
import type { Conversation, CustomerInsights, Order } from '../components/conversations/types';
import { useConversations } from '../components/conversations/hooks/useConversations';
import { useMessages } from '../components/conversations/hooks/useMessages';

export function Conversations() {
  const { user } = useAuth();
  const location = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [customerInsights, setCustomerInsights] = useState<CustomerInsights | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ConversationFilters>({
    aiPauseStatus: 'all',
    hasOrder: 'all',
    customerType: 'all',
  });

  // Check for conversationId in navigation state or query params
  const conversationIdFromState = location.state?.conversationId;
  const searchParams = new URLSearchParams(location.search);
  const conversationIdFromQuery = searchParams.get('conversationId');
  const conversationId = conversationIdFromState || conversationIdFromQuery;

  const {
    conversations,
    isLoading,
    isLoadingMore,
    error: conversationsError,
    hasMore,
    searchQuery,
    setSearchQuery,
    refresh: refreshConversations,
    loadMore,
  } = useConversations({
    vendorId: user?.vendorId,
    pageSize: 20,
    filters,
  });

  const {
    messages,
    isLoading: isLoadingMessages,
    isLoadingMore: isLoadingOlderMessages,
    error: messagesError,
    hasMore: hasMoreMessages,
    aiPaused,
    setAiPaused,
    refresh: refreshMessages,
    loadOlder,
    hasNewMessages,
    loadNewMessages,
    newMessageCount,
    isLoadingNew,
  } = useMessages({
    conversationId: selectedConversation?.id,
    pageSize: 25,
    enablePolling: true,
    pollingInterval: 10000, // 10 seconds
  });

  // Fetch customer insights
  const fetchCustomerInsights = useCallback(async (customerId: string) => {
    if (!user?.vendorId) return;
    try {
      const response = await apiClient.get<{ customerId: string; vendorId: string; insights: CustomerInsights | null }>(
        `/vendors/${user.vendorId}/customer-insights?customerId=${customerId}`
      );
      setCustomerInsights(response.insights || null);
    } catch (err: unknown) {
      console.error('Error loading customer insights:', err);
      setCustomerInsights(null);
    }
  }, [user?.vendorId]);

  // Fetch customer orders
  const fetchCustomerOrders = useCallback(async (customerId: string) => {
    try {
      const data = await apiClient.get<Order[]>(
        `/orders/customers/${customerId}/orders`
      );
      setCustomerOrders(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      // If endpoint doesn't exist yet, silently fail
      console.error('Error loading customer orders:', err);
      setCustomerOrders([]);
    }
  }, []);

  // Keep customer context in sync with the selected conversation
  const handleConversationSelect = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    if (conversation.customerId) {
      fetchCustomerInsights(conversation.customerId);
      fetchCustomerOrders(conversation.customerId);
    } else {
      setCustomerInsights(null);
      setCustomerOrders([]);
    }
  };

  // Auto-select conversation if conversationId is present
  useEffect(() => {
    if (conversationId && conversations.length > 0) {
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation) {
        handleConversationSelect(conversation);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversations]);

  const handleRefresh = async () => {
    await refreshConversations();
    if (selectedConversation) {
      await refreshMessages();
    }
  };

  const handleToggleAIPause = async () => {
    if (!selectedConversation) return;
    
    // Store the previous value for error rollback
    const previousPausedStatus = aiPaused;
    const newPausedStatus = !aiPaused;
    
    try {
      // Optimistically update the UI immediately
      setAiPaused(newPausedStatus);
      setSelectedConversation(prev => prev ? { ...prev, aiPaused: newPausedStatus } : null);
      
      // Then update on the server
      await apiClient.put(`/conversations/${selectedConversation.id}/ai-pause`, {
        paused: newPausedStatus
      });
      
      // Refresh messages to sync with server (in case of any discrepancies)
      await refreshMessages();
    } catch (err: unknown) {
      console.error('Error toggling AI pause:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle AI pause';
      setError(errorMessage);
      // Revert optimistic update on error
      setAiPaused(previousPausedStatus);
      setSelectedConversation(prev => prev ? { ...prev, aiPaused: previousPausedStatus } : null);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || isSending) return;

    const messageToSend = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    setError(null);

    try {
      await apiClient.post(`/conversations/${selectedConversation.id}/messages`, {
        content: messageToSend
      });
      await refreshMessages();
      await refreshConversations(); // Refresh conversation list to update last message
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const combinedError = error || conversationsError || messagesError;

  return (
    <div className="h-full flex items-stretch">
      <div className="mx-auto w-full h-full flex flex-col lg:flex-row bg-gray-50 shadow-sm">
        {/* Conversation List - Hidden on mobile when conversation is selected */}
        <div className={`${selectedConversation ? 'hidden lg:block' : 'block'} w-full lg:w-[30%] lg:max-w-md`}>
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversation?.id || null}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectConversation={handleConversationSelect}
            isRefreshing={isLoading || isLoadingMore}
            onRefresh={handleRefresh}
            error={combinedError}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Center Panel - Chat View */}
        <div className="flex-1 flex flex-col bg-white border-l border-r border-gray-200 relative">
          {selectedConversation ? (
            <>
              {/* Back button for mobile */}
              <button
                onClick={() => setSelectedConversation(null)}
                className="lg:hidden absolute top-2 left-2 z-10 p-2 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors"
                aria-label="Back to conversations"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <ConversationHeader
                conversation={{ ...selectedConversation, aiPaused }}
                onToggleAIPause={handleToggleAIPause}
              />
              <MessageList
                messages={messages}
                hasMore={hasMoreMessages}
                isLoadingMore={isLoadingOlderMessages}
                onLoadOlder={loadOlder}
                error={messagesError}
                onRetry={refreshMessages}
                hasNewMessages={hasNewMessages}
                newMessageCount={newMessageCount}
                onLoadNewMessages={loadNewMessages}
                isLoadingNew={isLoadingNew}
              />
              {aiPaused && (
                <MessageInput
                  value={newMessage}
                  onChange={setNewMessage}
                  onSend={handleSendMessage}
                  onKeyPress={handleKeyPress}
                  disabled={isSending || isLoadingMessages}
                  error={combinedError}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50 p-4">
              <div className="text-center">
                <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">💬</div>
                <h3 className="text-lg sm:text-xl font-medium text-gray-900 mb-2">
                  Select a conversation
                </h3>
                <p className="text-sm sm:text-base text-gray-500">
                  Choose a conversation from the list to view messages
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Customer Details - Hidden on mobile and tablet */}
        {selectedConversation && (
          <div className="hidden xl:block xl:w-[25%] xl:max-w-sm">
            <CustomerDetailsPanel
              conversation={selectedConversation}
              customerInsights={customerInsights}
              customerOrders={customerOrders}
            />
          </div>
        )}
      </div>
    </div>
  );
}
