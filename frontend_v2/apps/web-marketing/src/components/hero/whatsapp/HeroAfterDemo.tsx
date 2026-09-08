import { useEffect, useMemo, useRef, useState } from 'react';
import { heroPreviewAfter } from '../../../copy';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';
import type { HeroAfterSimEvent } from './heroAfterSim';
import {
  applyHeroAfterSimEvent,
  countScriptOrders,
  emptyHeroAfterChatState,
  type HeroAfterChatRow,
} from './heroAfterSim';
import { ChatListRow, WaListHeader, WhatsAppPhoneShell, type ChatListItemData } from './WhatsAppPhoneShell';
import { HeroDemoStatPopup } from './HeroDemoStatPopup';
import { useHeroDemoPopupSync } from './HeroDemoPopupSync';

const { timing, chats: afterChats } = heroPreviewAfter;
const SCRIPT = heroPreviewAfter.simScript as HeroAfterSimEvent[];
const TYPING_DELAY_MS = timing.typingDelayAfterMessageMs;
const SCRIPT_END_MS = Math.max(...SCRIPT.map((e) => e.atMs));
const TOTAL_ORDERS = countScriptOrders(SCRIPT);

function toListItem(row: HeroAfterChatRow, id: string): ChatListItemData {
  return {
    id,
    name: row.name,
    time: row.time,
    preview: row.preview,
    unread: row.unread,
    isVoice: row.isVoice,
    fromShop: row.fromShop,
    typing: row.typing,
    highlight: row.typing,
    justArrived: row.justArrived,
  };
}

export function HeroAfterDemo({ size = 'default' }: { size?: 'default' | 'compact' | 'dual' }) {
  const reduced = usePrefersReducedMotion();
  const popupSync = useHeroDemoPopupSync();
  const popupSyncRef = useRef(popupSync);
  popupSyncRef.current = popupSync;
  const scrollClass = size === 'dual' ? 'phone-demo-scroll overflow-hidden' : 'overflow-y-auto';
  const [chatState, setChatState] = useState(() => emptyHeroAfterChatState(heroPreviewAfter.chats));
  const [appearanceOrder, setAppearanceOrder] = useState<string[]>([]);
  const [allDone, setAllDone] = useState(false);
  const [orderCount, setOrderCount] = useState(0);

  const typingCount = useMemo(
    () => Object.values(chatState).filter((row) => row.visible && row.typing).length,
    [chatState],
  );

  const visibleCount = useMemo(
    () => Object.values(chatState).filter((row) => row.visible).length,
    [chatState],
  );

  const listItems = useMemo(() => {
    return appearanceOrder
      .filter((id) => chatState[id]?.visible)
      .map((id) => toListItem(chatState[id], id));
  }, [chatState, appearanceOrder]);

  useEffect(() => {
    if (reduced) {
      let state = emptyHeroAfterChatState(heroPreviewAfter.chats);
      const order: string[] = [];
      for (const event of SCRIPT) {
        state = applyHeroAfterSimEvent(state, event);
        if (event.action === 'appear' && !order.includes(event.chatId)) {
          order.push(event.chatId);
        }
      }
      setChatState(state);
      setAppearanceOrder(order);
      setOrderCount(TOTAL_ORDERS);
      setAllDone(true);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    function schedule(fn: () => void, ms: number) {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    }

    function runCycle() {
      timers.splice(0).forEach((t) => window.clearTimeout(t));
      setChatState(emptyHeroAfterChatState(heroPreviewAfter.chats));
      setAppearanceOrder([]);
      setAllDone(false);
      setOrderCount(0);

      for (const event of SCRIPT) {
        schedule(() => {
          setChatState((prev) => applyHeroAfterSimEvent(prev, event));
          if (event.action === 'appear') {
            setAppearanceOrder((prev) => (prev.includes(event.chatId) ? prev : [...prev, event.chatId]));
          }
          if (event.action === 'reply' && event.countsAsOrder) {
            setOrderCount((n) => n + 1);
          }
          if (event.action === 'appear' || event.action === 'customer') {
            schedule(() => {
              setChatState((prev) =>
                applyHeroAfterSimEvent(prev, {
                  atMs: 0,
                  action: 'typing',
                  chatId: event.chatId,
                }),
              );
            }, TYPING_DELAY_MS);
          }
        }, event.atMs);
      }

      schedule(() => setAllDone(true), SCRIPT_END_MS + 200);
      if (popupSyncRef.current) {
        schedule(() => {
          void (async () => {
            await popupSyncRef.current?.waitForPopupHold('after');
            if (!cancelled) runCycle();
          })();
        }, SCRIPT_END_MS + 200);
      } else {
        schedule(runCycle, SCRIPT_END_MS + timing.loopHoldMs + timing.loopGapMs);
      }
    }

    runCycle();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [reduced]);

  const bannerText = allDone
    ? heroPreviewAfter.parallelBanner.done(afterChats.length, TOTAL_ORDERS)
    : typingCount > 0
      ? heroPreviewAfter.parallelBanner.handling(typingCount)
      : visibleCount === 0
        ? heroPreviewAfter.parallelBanner.waiting
        : heroPreviewAfter.replyBadge;

  return (
    <WhatsAppPhoneShell size={size} aria-label="ChatLogix handling multiple WhatsApp chats in parallel">
      <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
        <WaListHeader />
        <div
          className={`flex items-center justify-between border-b border-[#e9edef] px-4 py-1.5 transition-colors duration-500 ${
            typingCount > 0 ? 'bg-[#e7fce3]' : allDone ? 'bg-[#e7fce3]' : 'bg-white'
          }`}
        >
          <span className="min-w-0 flex-1 truncate pr-2 text-[11px] font-medium text-[#008069]">{bannerText}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-[#667781]">
            {allDone ? (
              <>
                <span className="rounded-full bg-[#25D366]/15 px-1.5 py-0.5 font-semibold text-[#008069]">
                  {TOTAL_ORDERS} orders
                </span>
                <span className="rounded-full bg-[#008069]/10 px-1.5 py-0.5 font-semibold text-[#008069]">
                  {afterChats.length} replies
                </span>
              </>
            ) : typingCount > 0 ? (
              <span className="flex gap-0.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1 w-1 rounded-full bg-[#008069] motion-safe:animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            ) : orderCount > 0 ? (
              <span className="font-semibold tabular-nums text-[#008069]">{orderCount} orders</span>
            ) : (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-[#25D366] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#25D366]" />
                </span>
                {visibleCount > 0 ? `${visibleCount} chats` : 'Live'}
              </>
            )}
          </span>
        </div>
        <div className={`relative min-h-0 flex-1 bg-white ${scrollClass}`}>
          {listItems.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-6 text-center">
              <p className="text-[13px] text-[#667781]">No conversations yet</p>
              <p className="mt-1 text-[11px] text-[#8696a0]">Customers message you on WhatsApp as usual</p>
            </div>
          ) : (
            listItems.map((item) => <ChatListRow key={item.id} item={item} />)
          )}
        </div>
        {(popupSync ? popupSync.showPopup || reduced : allDone) ? (
          <HeroDemoStatPopup variant="solution" />
        ) : null}
      </div>
    </WhatsAppPhoneShell>
  );
}
