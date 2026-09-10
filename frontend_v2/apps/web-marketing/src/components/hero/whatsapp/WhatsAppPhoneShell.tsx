import type { ReactNode } from 'react';
import { wa } from './whatsappChrome';

interface WhatsAppPhoneShellProps {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * WhatsApp phone chrome, sized to fill its parent exactly.
 *
 * The shell no longer carries any responsive sizing of its own: it is always rendered
 * inside a `PhoneDemoFrame`, which lays it out at a fixed 320x520 and scales the result.
 * Border radius, border width and the status-bar type are therefore fixed too — they used
 * to step at `sm`/`lg` while the frame width moved continuously, which is one of the ways
 * the same demo ended up reading differently in different sections.
 */
export function WhatsAppPhoneShell({
  children,
  className = '',
  'aria-label': ariaLabel,
}: WhatsAppPhoneShellProps) {
  return (
    <figure
      className={`h-full w-full ${className}`}
      aria-label={ariaLabel ?? 'WhatsApp mobile preview'}
    >
      <div className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[2rem] border-[6px] border-[#1a1a1a] bg-[#1a1a1a] shadow-[0_10px_28px_rgba(7,35,73,0.10)]">
        <div className="flex shrink-0 items-center justify-between bg-[#008069] px-5 py-1.5 text-[10px] text-white/90">
          <span>10:24</span>
          <div className="flex items-center gap-1" aria-hidden>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 17h20v2H2zM2 5h20v2H2zM2 11h20v2H2z" />
            </svg>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" />
            </svg>
            <svg className="h-3.5 w-4" viewBox="0 0 24 12" fill="currentColor">
              <rect x="1" y="1" width="18" height="10" rx="2" stroke="currentColor" fill="none" strokeWidth="1" />
              <rect x="3" y="3" width="12" height="6" rx="1" fill="currentColor" />
            </svg>
          </div>
        </div>
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-b-[1.55rem] bg-white">
          {children}
        </div>
      </div>
    </figure>
  );
}

export function WaListHeader({ unreadTotal }: { unreadTotal?: string }) {
  return (
    <div className="bg-[#008069] px-4 pb-3 pt-2 text-white">
      <div className="flex items-center justify-between">
        <h3 className="text-[19px] font-semibold tracking-tight">WhatsApp</h3>
        <div className="flex items-center gap-4 text-white/95" aria-hidden>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </div>
      </div>
      {unreadTotal ? (
        <p className="mt-1 text-[11px] font-medium text-[#d9fdd3]">{unreadTotal} unread messages</p>
      ) : null}
    </div>
  );
}

export function WaChatHeaderActions({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]';
  const gap = size === 'sm' ? 'gap-1.5' : 'gap-2.5';

  return (
    <span className={`ml-auto flex shrink-0 items-center ${gap} text-white/95`} aria-hidden>
      <svg className={icon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
      </svg>
      <svg className={icon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.02l-2.2 2.21z" />
      </svg>
      <svg className={icon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
      </svg>
    </span>
  );
}

export function WaChatHeader({
  name,
  onBack,
  subtitle,
}: {
  name: string;
  onBack?: boolean;
  subtitle?: string;
}) {
  const isPhoneContact = name.includes('xxxxx');

  return (
    <div className="flex items-center gap-2 bg-[#008069] px-2 py-2 text-white sm:gap-3">
      {onBack ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </span>
      ) : null}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
        {isPhoneContact ? (
          <svg className="h-5 w-5 text-white/90" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        ) : (
          name.slice(0, 1)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] font-medium leading-tight ${isPhoneContact ? 'tabular-nums tracking-tight' : ''}`}>
          {name}
        </p>
        {subtitle ? <p className="text-[11px] text-white/75">{subtitle}</p> : null}
      </div>
      <WaChatHeaderActions />
    </div>
  );
}

export function WaComposer({
  draft = '',
  typing = false,
}: {
  draft?: string;
  typing?: boolean;
}) {
  return (
    <div className={`flex items-end gap-2 border-t border-[#e9edef] px-2 py-2 ${wa.composerBg}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[#54656f]" aria-hidden>
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
        </svg>
      </span>
      <div className="min-h-[36px] flex-1 rounded-full bg-white px-4 py-2 text-[13px] text-[#111b21]">
        {typing ? (
          <span className="inline-flex items-center">
            {draft}
            <span className="ml-0.5 inline-block h-3.5 w-0.5 motion-safe:animate-pulse bg-[#008069]" />
          </span>
        ) : (
          draft || <span className="text-[#667781]">Message</span>
        )}
      </div>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${draft ? 'bg-[#008069]' : 'text-[#54656f]'} text-white`}
        aria-hidden
      >
        {draft ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
      </span>
    </div>
  );
}

export interface ChatListItemData {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread?: number | string;
  isVoice?: boolean;
  fromShop?: boolean;
  typing?: boolean;
  highlight?: boolean;
  replied?: boolean;
  justArrived?: boolean;
}

export function ChatListRow({ item }: { item: ChatListItemData }) {
  const isPhoneContact = item.name.includes('xxxxx');

  return (
    <div
      className={`flex items-center gap-3 border-b border-[#e9edef] px-4 py-3 transition-colors duration-300 ${
        item.justArrived
          ? 'bg-[#fff8e6] motion-safe:animate-[fadeSlideIn_0.45s_ease-out]'
          : item.highlight
            ? 'bg-[#f0f2f5]'
            : 'bg-white'
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-base font-medium text-[#54656f]">
        {isPhoneContact ? (
          <svg className="h-6 w-6 text-[#8696a0]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        ) : (
          item.name.slice(0, 1)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`truncate text-[13px] font-normal leading-tight text-[#111b21] ${isPhoneContact ? 'tabular-nums tracking-tight' : ''}`}
          >
            {item.name}
          </p>
          <span className={`shrink-0 text-[11px] ${item.unread ? 'font-medium text-[#25D366]' : 'text-[#667781]'}`}>
            {item.time}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={`truncate text-[12px] ${
              item.typing ? 'italic text-[#008069]' : 'text-[#667781]'
            }`}
          >
            {item.fromShop && !item.typing ? (
              <span className="text-[#667781]">You: </span>
            ) : null}
            {item.isVoice && !item.typing ? (
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                </svg>
                {item.preview}
              </span>
            ) : (
              item.preview
            )}
          </p>
          {item.unread ? (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-semibold text-white">
              {item.unread}
            </span>
          ) : item.fromShop && !item.typing ? (
            <svg className="h-4 w-4 shrink-0 text-[#53bdeb]" viewBox="0 0 16 15" fill="currentColor" aria-hidden>
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.28 9.88 5.03 6.63a.365.365 0 0 0-.516.006l-.424.433a.364.364 0 0 0 .006.514l3.58 3.58a.365.365 0 0 0 .516-.006l6.5-7.5a.365.365 0 0 0-.063-.51z" />
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.18 9.88 2.53 8.23a.364.364 0 0 0-.516.006l-.424.433a.364.364 0 0 0 .006.514l2.16 2.16a.365.365 0 0 0 .516-.006l6.5-7.5a.365.365 0 0 0-.063-.51z" />
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}
