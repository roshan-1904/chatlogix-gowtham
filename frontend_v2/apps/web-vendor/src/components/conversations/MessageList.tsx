import { memo, useCallback, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from './types';
import { groupMessagesByDateAndSender } from './utils/messageGrouping';
import { DateSeparator } from './DateSeparator';
import { MessageGroup } from './MessageGroup';

interface MessageListProps {
  readonly conversationId?: string | null;
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
  readonly onReplyToMessage?: (message: Message) => void;
}

const NEAR_BOTTOM_PX = 80;

function isNearBottom(el: HTMLElement, threshold = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function MessageListComponent({
  conversationId,
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
  onReplyToMessage,
}: MessageListProps) {
  const { t } = useTranslation('conversations');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const stickToBottomRef = useRef(true);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
  const previousFirstIdRef = useRef<string | undefined>(undefined);
  const previousLastIdRef = useRef<string | undefined>(undefined);
  const previousLengthRef = useRef(0);
  const shouldPreserveScrollRef = useRef(false);
  const isJumpingRef = useRef(false);
  const [unseenCount, setUnseenCount] = useState(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const jumpToLatest = useCallback(() => {
    isJumpingRef.current = true;
    stickToBottomRef.current = true;
    setUnseenCount(0);
    scrollToBottom('smooth');
    window.setTimeout(() => {
      isJumpingRef.current = false;
      stickToBottomRef.current = true;
    }, 450);
    if (hasNewMessages && onLoadNewMessages && !isLoadingNew) {
      onLoadNewMessages();
    }
  }, [hasNewMessages, onLoadNewMessages, isLoadingNew, scrollToBottom]);

  const scrollToMessage = useCallback((id: string) => {
    const el = messageRefs.current.get(id);
    if (!el) return;
    stickToBottomRef.current = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-[#25D366]', 'ring-offset-2', 'rounded-md');
    window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-[#25D366]', 'ring-offset-2', 'rounded-md');
    }, 1500);
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (isJumpingRef.current) return;
    if (target.scrollTop <= 100 && hasMore && !isLoadingMore) {
      previousScrollTopRef.current = target.scrollTop;
      previousScrollHeightRef.current = target.scrollHeight;
      shouldPreserveScrollRef.current = true;
      onLoadOlder();
    }

    const pinned = isNearBottom(target);
    stickToBottomRef.current = pinned;
    if (pinned) {
      setUnseenCount(0);
      if (hasNewMessages && onLoadNewMessages && !isLoadingNew) {
        onLoadNewMessages();
      }
    }
  };

  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    shouldPreserveScrollRef.current = false;
    previousLengthRef.current = 0;
    previousFirstIdRef.current = undefined;
    previousLastIdRef.current = undefined;
    previousScrollHeightRef.current = 0;
    previousScrollTopRef.current = 0;
    setUnseenCount(0);
  }, [conversationId]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;
    const prevLen = previousLengthRef.current;
    const prevFirst = previousFirstIdRef.current;
    const prevLast = previousLastIdRef.current;
    const lengthDelta = messages.length - prevLen;
    const prepended =
      lengthDelta > 0 &&
      prevLen > 0 &&
      firstId !== prevFirst &&
      (shouldPreserveScrollRef.current || lastId === prevLast);
    const appended =
      lengthDelta > 0 && prevLen > 0 && lastId !== prevLast && firstId === prevFirst;

    if (prepended) {
      const delta = el.scrollHeight - previousScrollHeightRef.current;
      el.scrollTop = previousScrollTopRef.current + delta;
      shouldPreserveScrollRef.current = false;
    } else if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (appended) {
      setUnseenCount((count) => count + lengthDelta);
    }

    previousLengthRef.current = messages.length;
    previousFirstIdRef.current = firstId;
    previousLastIdRef.current = lastId;
    previousScrollHeightRef.current = el.scrollHeight;
    previousScrollTopRef.current = el.scrollTop;
  }, [messages, isLoadingMore]);

  useLayoutEffect(() => {
    const scroller = containerRef.current;
    const content = contentRef.current;
    if (!scroller || !content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [conversationId]);

  const datedGroups = groupMessagesByDateAndSender(messages);
  const badgeCount = unseenCount > 0 ? unseenCount : hasNewMessages ? newMessageCount || 1 : 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        className="chat-canvas conversation-scrollbar chat-message-list flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:px-8"
        onScroll={handleScroll}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
      >
        <div ref={contentRef} className="space-y-2">
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
                <button type="button" onClick={onRetry} className="underline hover:text-red-900">
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {datedGroups.length === 0 && !isLoadingMore && !error && (
          <div className="h-full flex items-center justify-center text-sm text-[#667781]">
            No messages yet.
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
                  onReplyToMessage={onReplyToMessage}
                />
              ))}
            </div>
          </div>
        ))}
        </div>
      </div>

      {badgeCount > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <button
            type="button"
            onClick={jumpToLatest}
            disabled={isLoadingNew}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-[#00a884] px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-[#029a78] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span aria-hidden>↓</span>
            <span>
              {badgeCount === 1
                ? t('newMessages.one')
                : t('newMessages.other', { count: badgeCount })}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export const MessageList = memo(MessageListComponent);
