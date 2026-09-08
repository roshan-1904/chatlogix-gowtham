import { useEffect, useRef, useState } from 'react';
import { customerExperience } from '../../copy';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { chatChrome } from '../../lib/chatChrome';
import { WaChatHeader, WaComposer, WhatsAppPhoneShell } from '../hero/whatsapp/WhatsAppPhoneShell';

const messages = customerExperience.messages;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function DoubleTick() {
  return (
    <svg className="h-3 w-3 text-[#53bdeb]" viewBox="0 0 16 15" fill="currentColor" aria-hidden>
      <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.28 9.88 5.03 6.63a.365.365 0 0 0-.516.006l-.424.433a.364.364 0 0 0 .006.514l3.58 3.58a.365.365 0 0 0 .516-.006l6.5-7.5a.365.365 0 0 0-.063-.51z" />
      <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.18 9.88 2.53 8.23a.364.364 0 0 0 .006.514l2.16 2.16a.365.365 0 0 0 .516-.006l6.5-7.5a.365.365 0 0 0-.063-.51z" />
    </svg>
  );
}

function ChatBubble({
  role,
  text,
  time,
}: {
  role: (typeof messages)[number]['role'];
  text: string;
  time: string;
}) {
  const mine = role === 'customer';
  return (
    <div className={`flex w-full ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[82%] px-2 py-1.5 ${mine ? chatChrome.outgoing : chatChrome.incoming} ${chatChrome.shadow}`}
      >
        <p dir="auto" className="whitespace-pre-wrap pr-12 text-[12px] leading-[1.45] text-[#111b21]">
          {text}
        </p>
        <span className="absolute bottom-1 right-1.5 flex items-center gap-0.5 text-[9px] text-[#667781]">
          {time}
          {mine ? <DoubleTick /> : null}
        </span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        className={`inline-flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-3 py-2.5 ${chatChrome.shadow}`}
        aria-hidden
      >
        {[0, 150, 300].map((delayMs) => (
          <span
            key={delayMs}
            className="h-1.5 w-1.5 rounded-full bg-[#8696a0] motion-safe:animate-bounce"
            style={{ animationDelay: `${delayMs}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function usePlayback(reduced: boolean) {
  const [visible, setVisible] = useState(reduced ? messages.length : 0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (reduced) {
      setVisible(messages.length);
      setTyping(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        setVisible(0);
        setTyping(false);
        await delay(800);
        for (let i = 0; i < messages.length; i += 1) {
          if (cancelled) return;
          const line = messages[i];
          if (line.role === 'assistant') {
            setTyping(true);
            await delay(1100);
            if (cancelled) return;
            setTyping(false);
          }
          setVisible(i + 1);
          await delay(line.role === 'assistant' ? 2200 : 1100);
        }
        await delay(4000);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [reduced]);

  return { visible, typing };
}

export function NaturalConversationDemo() {
  const reduced = usePrefersReducedMotion();
  const { visible, typing } = usePlayback(reduced);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const revealed = messages.slice(0, visible);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [visible, typing, reduced]);

  return (
    <div className="mx-auto w-full max-w-[230px] sm:max-w-[250px] lg:max-w-[260px] xl:max-w-[290px]">
      <ol className="sr-only">
        {messages.map((line) => (
          <li key={`${line.lang}-${line.role}-${line.text}`}>
            {`${line.role === 'customer' ? 'Customer' : 'ChatLogix'} (${line.lang}): ${line.text}`}
          </li>
        ))}
      </ol>
      <WhatsAppPhoneShell className="!mx-auto !max-w-none" aria-label={customerExperience.exampleLabel}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden" aria-hidden>
          <WaChatHeader name={customerExperience.shopName} subtitle={customerExperience.shopSubtitle} />
          <div
            ref={scrollerRef}
            className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ backgroundColor: '#e5ddd5' }}
          >
            {revealed.map((line) => (
              <ChatBubble key={`${line.time}-${line.text}`} role={line.role} text={line.text} time={line.time} />
            ))}
            {typing ? <TypingIndicator /> : null}
          </div>
          <WaComposer />
        </div>
      </WhatsAppPhoneShell>
    </div>
  );
}
