import { memo, useCallback, useLayoutEffect, useRef, UIEvent } from 'react';
import type { Message } from './types';
import { groupMessagesByDateAndSender } from './utils/messageGrouping';
import { DateSeparator } from './DateSeparator';
import { MessageGroup } from './MessageGroup';

interface MessageListProps {
  readonly messages: Message[];
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly onLoadOlder: () => void;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly hasNewMessages?: boolean;
  readonly newMessageCount?: number;
  readonly onLoadNewMessages?: () => void;
  readonly isLoadingNew?: boolean;
}

function MessageListComponent({
  messages,
  hasMore,
  isLoadingMore,
  onLoadOlder,
  error,
  onRetry,
  hasNewMessages = false,
  newMessageCount = 0,
  onLoadNewMessages,
  isLoadingNew = false,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const previousScrollHeightRef = useRef<number>(0);
  const previousScrollTopRef = useRef<number>(0);
  const previousMessagesLengthRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const shouldPreserveScrollRef = useRef<boolean>(false);

  const scrollToMessage = useCallback((id: string) => {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded');
    window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded');
    }, 1500);
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollTop <= 100 && hasMore && !isLoadingMore) {
      // Capture scroll position before loading older messages
      previousScrollTopRef.current = target.scrollTop;
      previousScrollHeightRef.current = target.scrollHeight;
      shouldPreserveScrollRef.current = true;
      onLoadOlder();
    }
    
    // Auto-load new messages if user scrolls to bottom
    const isNearBottom = 
      target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    
    if (isNearBottom && hasNewMessages && onLoadNewMessages && !isLoadingNew) {
      onLoadNewMessages();
    }
  };

  // Capture scroll position before messages change (runs synchronously before paint)
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only capture if we're not preserving scroll (i.e., not loading older messages)
    if (!shouldPreserveScrollRef.current) {
      previousScrollTopRef.current = container.scrollTop;
      previousScrollHeightRef.current = container.scrollHeight;
    }
  }, [messages.length]);

  // Handle scroll position after messages change
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentMessagesLength = messages.length;
    const previousMessagesLength = previousMessagesLengthRef.current;
    const previousScrollHeight = previousScrollHeightRef.current;
    const previousScrollTop = previousScrollTopRef.current;

    // Check if we're loading older messages (prepended) - this must be checked FIRST
    if (shouldPreserveScrollRef.current && isLoadingMore && currentMessagesLength > previousMessagesLength) {
      // Older messages were prepended - preserve scroll position
      const newScrollHeight = container.scrollHeight;
      const heightDifference = newScrollHeight - previousScrollHeight;
      
      // Maintain the same visual position by adjusting scroll
      container.scrollTop = previousScrollTop + heightDifference;
      
      // Reset the flag
      shouldPreserveScrollRef.current = false;
    } 
    // Initial load - scroll to bottom
    else if (isInitialLoadRef.current) {
      container.scrollTop = container.scrollHeight;
      isInitialLoadRef.current = false;
    }
    // New messages added at the bottom
    else if (currentMessagesLength > previousMessagesLength && !isLoadingMore && !isLoadingNew) {
      // Check if we're near the bottom (within 100px) - user is viewing recent messages
      const isNearBottom = 
        previousScrollHeight - previousScrollTop - container.clientHeight < 100;
      
      // Only auto-scroll if user was already at bottom
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
    
    // Auto-scroll when new messages are loaded (if user was at bottom)
    if (isLoadingNew && currentMessagesLength > previousMessagesLength) {
      const isNearBottom = 
        previousScrollHeight - previousScrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }

    // Update refs for next render
    previousScrollHeightRef.current = container.scrollHeight;
    previousScrollTopRef.current = container.scrollTop;
    previousMessagesLengthRef.current = currentMessagesLength;
  }, [messages.length, isLoadingMore]);

  // Reset refs when conversation changes (new conversation selected)
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && messages.length > 0) {
      // Only reset if this is actually a new conversation (check first message ID)
      const firstMessageId = messages[0]?.id;
      if (firstMessageId && previousMessagesLengthRef.current === 0) {
        isInitialLoadRef.current = true;
        shouldPreserveScrollRef.current = false;
        previousMessagesLengthRef.current = 0;
        previousScrollHeightRef.current = 0;
        previousScrollTopRef.current = 0;
      }
    }
  }, [messages[0]?.id]);

  const datedGroups = groupMessagesByDateAndSender(messages);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50"
      onScroll={handleScroll}
      role="log"
      aria-label="Conversation messages"
      aria-live="polite"
    >
      {isLoadingMore && (
        <div className="flex justify-center my-2 text-xs text-gray-600">
          Loading older messages…
        </div>
      )}

      {error && (
        <div className="flex justify-center my-2">
          <div className="bg-red-50 text-red-700 text-xs px-3 py-1 rounded-full flex items-center space-x-2">
            <span>{error}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="underline hover:text-red-900"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {datedGroups.length === 0 && !isLoadingMore && !error && (
        <div className="h-full flex items-center justify-center text-sm text-gray-600">
          No messages yet. Say hello to start the conversation.
        </div>
      )}

      {datedGroups.map((day) => (
        <div key={day.dateKey} className="space-y-2">
          <DateSeparator label={day.label} />
          <div className="space-y-2">
            {day.groups.map((group) => (
              <MessageGroup
                key={group.id}
                group={group}
                messageRefs={messageRefs}
                onJumpToMessage={scrollToMessage}
              />
            ))}
          </div>
        </div>
      ))}

      {/* New Messages Indicator */}
      {hasNewMessages && onLoadNewMessages && (
        <div className="sticky bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <button
            type="button"
            onClick={onLoadNewMessages}
            disabled={isLoadingNew}
            className="pointer-events-auto bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoadingNew ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Loading...</span>
              </>
            ) : (
              <>
                <span>↓</span>
                <span>
                  {(() => {
                    if (newMessageCount > 0) {
                      const plural = newMessageCount === 1 ? '' : 's';
                      return `${newMessageCount} new message${plural}`;
                    }
                    return 'New messages';
                  })()}
                </span>
                <span>Click to load</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export const MessageList = memo(MessageListComponent);

