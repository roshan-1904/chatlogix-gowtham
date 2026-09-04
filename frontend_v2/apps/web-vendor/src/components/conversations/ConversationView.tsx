import { useCallback } from 'react';
import { useMessages } from './hooks/useMessages';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { MediaGalleryProvider } from './MediaGalleryContext';
import type { Conversation } from './types';
import { apiClient } from '../../lib/api';

interface ConversationViewProps {
  conversationId: string;
  conversation: Conversation;
  onToggleAIPause?: () => void;
  enablePolling?: boolean;
  pollingInterval?: number;
}

export function ConversationView({
  conversationId,
  conversation,
  onToggleAIPause,
  enablePolling = true,
  pollingInterval = 10000,
}: ConversationViewProps) {
  const {
    messages,
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
    conversationId,
    pageSize: 25,
    enablePolling,
    pollingInterval,
  });

  const handleToggleAIPause = useCallback(async () => {
    if (!conversationId) return;
    
    try {
      const newPausedState = !aiPaused;
      await apiClient.post(`/conversations/${conversationId}/ai-pause`, {
        paused: newPausedState,
      });
      setAiPaused(newPausedState);
      
      // Call external handler if provided
      if (onToggleAIPause) {
        onToggleAIPause();
      }
    } catch (error) {
      console.error('Failed to toggle AI pause:', error);
    }
  }, [conversationId, aiPaused, setAiPaused, onToggleAIPause]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <ConversationHeader
        conversation={{ ...conversation, aiPaused }}
        onToggleAIPause={handleToggleAIPause}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <MediaGalleryProvider messages={messages}>
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
        </MediaGalleryProvider>
      </div>
    </div>
  );
}

