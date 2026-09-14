import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@chatlogix/auth';
import { apiClient } from '../lib/api';
import { ConversationList, type ConversationFilters } from '../components/conversations/ConversationList';
import { ConversationHeader } from '../components/conversations/ConversationHeader';
import { MessageList } from '../components/conversations/MessageList';
import { MessageInput } from '../components/conversations/MessageInput';
import { CustomerDetailsPanel } from '../components/conversations/CustomerDetailsPanel';
import { MediaGalleryProvider } from '../components/conversations/MediaGalleryContext';
import type { Conversation, CustomerInsights, Message, Order, PendingReplyTarget } from '../components/conversations/types';
import { useConversations } from '../components/conversations/hooks/useConversations';
import { useMessages } from '../components/conversations/hooks/useMessages';
import { notifyCustomerQueriesChanged } from '../hooks/queries/useCustomerQueries';

export function Conversations() {
  const { user } = useAuth();
  const location = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [customerInsights, setCustomerInsights] = useState<CustomerInsights | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<PendingReplyTarget | null>(null);
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
    setReplyTo(null);
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
      const payload: { content: string; replyToMessageId?: string } = { content: messageToSend };
      if (replyTo?.id) {
        payload.replyToMessageId = replyTo.id;
      }
      const sent = await apiClient.post<{ markedOpenQueries?: number }>(
        `/conversations/${selectedConversation.id}/messages`,
        payload
      );
      setReplyTo(null);
      if (sent.markedOpenQueries && sent.markedOpenQueries > 0) {
        toast.success('Save this as an FAQ from Queries');
        notifyCustomerQueriesChanged();
      }
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

  const handleReplyToMessage = useCallback((message: Message) => {
    if (message.senderType !== 'customer') return;
    setReplyTo({
      id: message.id,
      contentPreview: message.content,
      contentEn: message.contentEn
    });
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const combinedError = error || conversationsError || messagesError;

  return (
    <div className="-m-2 h-[calc(100%+1rem)] overflow-hidden lg:-m-3 lg:h-[calc(100%+1.5rem)]">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white lg:flex-row">
        {/* Conversation List - Hidden on mobile when conversation is selected */}
        <div className={`${selectedConversation ? 'hidden lg:flex' : 'flex'} h-full w-full min-h-0 flex-col lg:w-[30%] lg:max-w-md`}>
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

        <div className={`${selectedConversation ? 'flex' : 'hidden lg:flex'} relative min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2]`}>
          {selectedConversation ? (
            <>
              <button
                onClick={() => setSelectedConversation(null)}
                className="absolute left-2 top-2 z-10 rounded-full bg-white/90 p-2 shadow-md hover:bg-white lg:hidden"
                aria-label="Back to conversations"
              >
                <svg className="h-5 w-5 text-[#54656f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <ConversationHeader
                conversation={{ ...selectedConversation, aiPaused }}
                onToggleAIPause={handleToggleAIPause}
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <MediaGalleryProvider messages={messages}>
                  <MessageList
                    conversationId={selectedConversation.id}
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
                    onReplyToMessage={handleReplyToMessage}
                  />
                </MediaGalleryProvider>
              </div>
              {aiPaused && (
                <MessageInput
                  value={newMessage}
                  onChange={setNewMessage}
                  onSend={handleSendMessage}
                  onKeyPress={handleKeyPress}
                  disabled={isSending || isLoadingMessages}
                  error={combinedError}
                  replyTo={replyTo}
                  onClearReply={() => setReplyTo(null)}
                />
              )}
            </>
          ) : (
            <div className="chat-canvas flex flex-1 items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#00a884]/10 text-[#00a884]">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zm-3 12H7v-2h10v2zm0-3H7V9h10v2zm0-3H7V6h10v2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-[#111b21]">Select a conversation</h3>
                <p className="mt-2 text-sm text-[#667781]">
                  Choose a chat from the list to view messages, photos, and voice notes.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Customer Details - Hidden on mobile and tablet */}
        {selectedConversation && (
          <div className="hidden h-full min-h-0 xl:flex xl:w-[25%] xl:max-w-sm">
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
