import { useEffect, useRef, useState } from 'react';
import { heroPreviewBefore } from '../../../copy';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';
import { HeroDemoStatPopup } from './HeroDemoStatPopup';
import { useHeroDemoPopupSync } from './HeroDemoPopupSync';
import { TextBubble, TypingBubble, VoiceBubble } from './bubbles';
import {
  ChatListRow,
  WaChatHeader,
  WaComposer,
  WaListHeader,
  WhatsAppPhoneShell,
  type ChatListItemData,
} from './WhatsAppPhoneShell';
import { wa } from './whatsappChrome';

type Phase = 'list' | 'open' | 'typing' | 'sent' | 'back';

const THREAD_ORDER = ['priya', 'rahul'] as const;
const { timing } = heroPreviewBefore;

interface HeroBeforeDemoProps {
  size?: 'default' | 'compact' | 'dual';
}

export function HeroBeforeDemo({ size = 'default' }: HeroBeforeDemoProps) {
  const reduced = usePrefersReducedMotion();
  const popupSync = useHeroDemoPopupSync();
  const popupSyncRef = useRef(popupSync);
  popupSyncRef.current = popupSync;
  const threadIndexRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('list');
  const [threadId, setThreadId] = useState<(typeof THREAD_ORDER)[number]>('priya');
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [draft, setDraft] = useState('');
  const [sentReply, setSentReply] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showCustomerTyping, setShowCustomerTyping] = useState(false);
  const [listPulse, setListPulse] = useState(false);
  const [slide, setSlide] = useState<'list' | 'thread'>('list');
  const [showBacklogScroll, setShowBacklogScroll] = useState(false);

  const thread = heroPreviewBefore.threads[threadId];
  const fullDraft = thread.manualReply;
  const repliedToCurrent = showBacklogScroll || phase === 'back';

  const listItems: ChatListItemData[] = heroPreviewBefore.chats.map((chat) => {
    const isRepliedThread = repliedToCurrent && chat.id === threadId;
    const activeThread = heroPreviewBefore.threads[threadId as keyof typeof heroPreviewBefore.threads];
    const threadConfig = heroPreviewBefore.threads[chat.id as keyof typeof heroPreviewBefore.threads];
    const unreadCount = threadConfig ? threadConfig.messages.length : chat.unread;

    return {
      ...chat,
      highlight: slide === 'list' && chat.id === threadId && listPulse,
      unread:
        slide === 'list' && chat.id === 'c5' && phase === 'back' && !showBacklogScroll
          ? 32
          : isRepliedThread
            ? undefined
            : unreadCount,
      ...(isRepliedThread
        ? {
            fromShop: true,
            preview: activeThread.manualReply,
            time: heroPreviewBefore.vendorReplyTimes.answer.replace(' pm', '').replace(' am', ''),
          }
        : {}),
    };
  });

  useEffect(() => {
    if (reduced) {
      if (popupSync) {
        setThreadId('priya');
        setPhase('back');
        setSlide('list');
        setShowBacklogScroll(true);
        setVisibleMessages(0);
        setSentReply(false);
        setShowFollowUp(false);
        setShowCustomerTyping(false);
        return;
      }
      setThreadId('priya');
      setVisibleMessages(heroPreviewBefore.threads.priya.messages.length);
      setDraft(heroPreviewBefore.threads.priya.manualReply);
      setSentReply(true);
      setShowCustomerTyping(false);
      setShowFollowUp(true);
      setSlide('thread');
      setShowBacklogScroll(false);
      return;
    }

    let cancelled = false;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          if (!cancelled) resolve();
        }, ms);
      });

    async function runLoop() {
      while (!cancelled) {
        const id = THREAD_ORDER[threadIndexRef.current % THREAD_ORDER.length];
        const activeThread = heroPreviewBefore.threads[id];
        const reply = activeThread.manualReply;

        setThreadId(id);
        setPhase('list');
        setSlide('list');
        setVisibleMessages(0);
        setDraft('');
        setSentReply(false);
        setShowFollowUp(false);
        setShowCustomerTyping(false);
        setListPulse(false);
        setShowBacklogScroll(false);
        await wait(timing.listHoldMs * 0.6);

        setListPulse(true);
        await wait(timing.listHoldMs * 0.4);

        setPhase('open');
        setSlide('thread');
        setListPulse(false);
        setVisibleMessages(activeThread.messages.length);
        await wait(timing.slideMs);
        await wait(timing.beforeTypingMs);

        setPhase('typing');
        const typedReply = `${heroPreviewBefore.lateApology} ${reply}`;
        for (let i = 1; i <= typedReply.length; i += heroPreviewBefore.typingCharsPerTick) {
          setDraft(typedReply.slice(0, i));
          await wait(timing.typingMsPerChar);
        }
        await wait(500);

        setPhase('sent');
        setSentReply(true);
        setShowCustomerTyping(true);
        setDraft('');
        await wait(timing.afterSentHoldMs);

        setShowCustomerTyping(false);
        setShowFollowUp(true);
        await wait(timing.followUpDelayMs);

        setPhase('back');
        setSlide('list');
        setShowBacklogScroll(true);
        if (popupSyncRef.current) {
          await popupSyncRef.current.waitForPopupHold('before');
          if (cancelled) return;
        } else {
          await wait(timing.backlogScrollHoldMs);
          setShowBacklogScroll(false);
          await wait(timing.backToListHoldMs);
        }

        threadIndexRef.current += 1;
      }
    }

    void runLoop();
    return () => {
      cancelled = true;
    };
  }, [reduced]);

  const shownMessages = thread.messages.slice(0, visibleMessages);
  const inThread = slide === 'thread';
  const scrollClass =
    size === 'dual' ? 'phone-demo-scroll overflow-hidden' : 'overflow-y-auto';

  return (
    <WhatsAppPhoneShell size={size} aria-label="Busy vendor manually replying while unread messages pile up">
      <div className="relative h-full min-w-0 overflow-hidden">
        <div
          className={`absolute inset-0 flex flex-col transition-transform duration-500 ease-out motion-reduce:transition-none ${
            slide === 'thread' ? '-translate-x-full' : 'translate-x-0'
          }`}
        >
          <WaListHeader unreadTotal={heroPreviewBefore.unreadTotal} />
          <div className={`min-h-0 flex-1 ${scrollClass}`}>
            {listItems.map((item) => (
              <ChatListRow key={item.id} item={item} />
            ))}
          </div>
          {(popupSync ? popupSync.showPopup || reduced : showBacklogScroll) ? (
            <HeroDemoStatPopup variant="problem" />
          ) : null}
        </div>

        <div
          className={`absolute inset-0 flex flex-col transition-transform duration-500 ease-out motion-reduce:transition-none ${
            slide === 'thread' ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <WaChatHeader
            name={thread.name}
            onBack
            subtitle={inThread ? 'online' : undefined}
          />
          <div className={`min-h-0 flex-1 space-y-1.5 px-2 py-3 ${scrollClass} ${wa.canvas}`}>
            {shownMessages.map((msg, i) => (
              <div key={`msg-${i}`}>
                {msg.type === 'voice' ? (
                  <VoiceBubble from={msg.from} duration={msg.duration} time={msg.time} />
                ) : (
                  <TextBubble from={msg.from} text={msg.text} time={msg.time} />
                )}
              </div>
            ))}
            {sentReply ? (
              <>
                <div>
                  <TextBubble from="shop" text={heroPreviewBefore.lateApology} time={heroPreviewBefore.vendorReplyTimes.apology} />
                </div>
                <div>
                  <TextBubble from="shop" text={fullDraft} time={heroPreviewBefore.vendorReplyTimes.answer} ticks />
                </div>
              </>
            ) : null}
            {showCustomerTyping ? <TypingBubble /> : null}
            {showFollowUp ? (
              <div className="motion-safe:animate-[fadeSlideIn_0.35s_ease-out]">
                <TextBubble from="customer" text={heroPreviewBefore.followUpMessage} time={heroPreviewBefore.vendorReplyTimes.followUp} />
              </div>
            ) : null}
          </div>
          <WaComposer draft={draft} typing={phase === 'typing'} />
        </div>
      </div>
    </WhatsAppPhoneShell>
  );
}
