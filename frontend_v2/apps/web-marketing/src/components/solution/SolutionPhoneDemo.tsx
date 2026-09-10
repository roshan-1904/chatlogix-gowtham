import type { ReactNode } from 'react';
import { solutionDemo } from '../../copy';
import { wa } from '../hero/whatsapp/whatsappChrome';

function BlueTicks() {
  return (
    <svg className="h-3 w-3 text-[#53bdeb] sm:h-3.5 sm:w-3.5" viewBox="0 0 16 15" fill="currentColor" aria-hidden>
      <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.28 9.88 5.03 6.63a.365.365 0 0 0-.516.006l-.424.433a.364.364 0 0 0 .006.514l3.58 3.58a.365.365 0 0 0 .516-.006l6.5-7.5a.365.365 0 0 0-.063-.51z" />
      <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.18 9.88 2.53 8.23a.364.364 0 0 0 .006.514l2.16 2.16a.365.365 0 0 0 .516-.006l6.5-7.5a.365.365 0 0 0-.063-.51z" />
    </svg>
  );
}

function SolutionBubble({
  from,
  time,
  children,
}: {
  from: 'customer' | 'shop';
  time: string;
  children: ReactNode;
}) {
  const isShop = from === 'shop';

  return (
    <div className={`flex w-full ${isShop ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[88%] px-2 pb-3 pt-1 ${isShop ? wa.shopBubble : wa.customerBubble} ${wa.shadow}`}
      >
        <div className="pr-1 text-[10.5px] leading-[1.35] text-[#111b21] sm:text-[11.5px] lg:text-[13px]">{children}</div>
        <span className="absolute bottom-0.5 right-1.5 flex items-center gap-0.5 text-[8.5px] text-[#667781] sm:text-[9.5px] lg:text-[10.5px]">
          {time}
          {isShop ? <BlueTicks /> : null}
        </span>
      </div>
    </div>
  );
}

export function SolutionPhoneDemo() {
  return (
    <div
      data-solution-phone
      className="overflow-hidden rounded-[1.35rem] border-[5px] border-[#1a1a1a] bg-white shadow-[0_12px_32px_rgba(7,35,73,0.14)] sm:rounded-[1.6rem] sm:border-[6px] lg:rounded-[1.85rem] lg:border-[7px]"
      aria-label="ChatLogix catalog-backed reply example"
    >
      <div className="flex items-center gap-1.5 bg-[#008069] px-1.5 py-1.5 text-white sm:gap-2 sm:px-2 sm:py-2 lg:px-2.5 lg:py-2.5">
        <span className="flex h-7 w-5 shrink-0 items-center justify-center sm:h-8 sm:w-6" aria-hidden>
          <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </span>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-[11px] font-semibold text-[#54656f] sm:h-8 sm:w-8 sm:text-sm lg:h-9 lg:w-9">
          {solutionDemo.avatar}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium leading-tight sm:text-[14px] lg:text-[15px]" title={solutionDemo.shopName}>
            {solutionDemo.shopName}
          </p>
          <p className="text-[9px] leading-tight text-white/80 sm:text-[11px] lg:text-[12px]">{solutionDemo.subtitle}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2 pr-1 text-white/95 sm:gap-2.5" aria-hidden>
          <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
          <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.02l-2.2 2.21z" />
          </svg>
          <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </span>
      </div>

      <div className="space-y-1 bg-[#e5ddd5] px-1.5 py-1.5 sm:space-y-2 sm:px-2 sm:py-2.5 lg:space-y-2.5 lg:px-2.5 lg:py-3">
        {solutionDemo.messages.map((msg, i) => (
          <SolutionBubble key={i} from={msg.from} time={msg.time}>
            {'text' in msg ? (
              msg.text
            ) : (
              msg.lines.map((line) => (
                <span key={line.text} className={`block ${line.bold ? 'font-semibold' : ''}`}>
                  {line.text}
                </span>
              ))
            )}
          </SolutionBubble>
        ))}
      </div>

      <div className="flex items-center gap-1.5 bg-[#f0f2f5] px-1.5 py-1.5 sm:px-2 sm:py-2 lg:px-2.5 lg:py-2.5">
        <div className="h-7 flex-1 rounded-full bg-white px-3 text-[10px] leading-7 text-[#667781] sm:h-8 sm:text-[11px] sm:leading-8 lg:h-9 lg:text-[12px] lg:leading-9">
          Message
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white sm:h-8 sm:w-8 lg:h-9 lg:w-9" aria-hidden>
          <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </span>
      </div>
    </div>
  );
}
