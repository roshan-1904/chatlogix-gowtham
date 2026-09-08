import type { ReactNode } from 'react';
import { problem } from '../../copy';
import { WhatsAppMessage } from '../marketing/WhatsAppMessage';
import { WaChatHeaderActions } from '../hero/whatsapp/WhatsAppPhoneShell';

type ProblemItem = (typeof problem.items)[number];
type RepeatItem = Extract<ProblemItem, { id: 'repeat' }>;
type MissedItem = Extract<ProblemItem, { id: 'missed' }>;
type LostItem = Extract<ProblemItem, { id: 'lost' }>;

function ProfileDot() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20" aria-hidden>
      <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </span>
  );
}

function Sparkles({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M1 7.5L5 6M1 4h5M2 1.5L5.5 5" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

function ChatWindow({
  title,
  subtitle,
  children,
  trailing,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-[13.25rem] overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_8px_22px_rgba(11,20,26,0.1)] sm:w-[14rem] ${className}`}
    >
      <div className="flex items-center gap-2 bg-[#008069] px-2.5 py-2 text-white">
        <ProfileDot />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold leading-tight sm:text-[11px]">{title}</p>
          {subtitle ? <p className="truncate text-[8px] leading-tight text-white/80">{subtitle}</p> : null}
        </div>
        {trailing ?? <WaChatHeaderActions size="sm" />}
      </div>
      {children}
    </div>
  );
}

function RosePills({ tags }: { tags: readonly string[] }) {
  const rotations = ['-rotate-[8deg]', 'rotate-[5deg]', '-rotate-[6deg]', 'rotate-[7deg]'];
  const offsets = ['left-0 top-8', 'left-1 top-[4.6rem]', 'left-0 top-[8.1rem]', 'left-1 top-[11.6rem]'];

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {tags.map((tag, i) => (
        <span
          key={tag}
          className={`absolute inline-flex items-center gap-0.5 ${offsets[i] ?? offsets[0]} ${rotations[i] ?? ''}`}
        >
          <Sparkles className="text-rose-400" />
          <span className="rounded-full border border-rose-200 bg-[#fde2e2] px-2 py-0.5 text-[10px] font-semibold text-[#b42318] shadow-sm">
            {tag}
          </span>
        </span>
      ))}
    </div>
  );
}

function AmberNotes({ tags }: { tags: readonly string[] }) {
  const rotations = ['rotate-[3deg]', '-rotate-[2deg]', 'rotate-[4deg]', '-rotate-[3deg]'];
  const offsets = ['right-0 top-7', 'right-1 top-[4.4rem]', 'right-0 top-[8rem]', 'right-1 top-[11.5rem]'];

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {tags.map((tag, i) => (
        <span
          key={tag}
          className={`absolute inline-flex max-w-[7.5rem] items-start gap-0.5 ${offsets[i] ?? offsets[0]} ${rotations[i] ?? ''}`}
        >
          <Sparkles className="mt-0.5 shrink-0 text-amber-400" />
          <span className="rounded-xl border border-amber-200 bg-[#fde7c7] px-2 py-1 text-[9px] font-semibold leading-snug text-[#9a3412] shadow-sm sm:text-[10px]">
            {tag}
          </span>
        </span>
      ))}
    </div>
  );
}

export function RepetitiveQuestionsPreview({ item }: { item: RepeatItem }) {
  return (
    <div className="relative mx-auto h-[14.75rem] w-full max-w-[17.5rem]">
      <RosePills tags={item.tags} />
      <div className="flex h-full items-center justify-center pl-8">
        <ChatWindow title={item.chat.name}>
          <div className="space-y-1.5 bg-[#e5ddd5] p-2">
            {item.chat.messages.map((msg, i) => (
              <WhatsAppMessage key={`${msg.text}-${i}`} small mine={msg.from === 'shop'}>
                {msg.text}
              </WhatsAppMessage>
            ))}
          </div>
        </ChatWindow>
      </div>
    </div>
  );
}

export function UnreadInboxPreview({ item }: { item: MissedItem }) {
  return (
    <div className="relative mx-auto h-[14.75rem] w-full max-w-[17.5rem]">
      <AmberNotes tags={item.tags} />
      <div className="flex h-full items-center justify-center pr-8">
        <ChatWindow
          title="WhatsApp"
          subtitle="99+ unread messages"
          trailing={
            <span className="ml-auto flex items-center gap-1.5 text-white/90" aria-hidden>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 5 1.5-1.5-5-5zM9.5 14C7 14 5 12 5 9.5S7 5 9.5 5 14 7 14 9.5 12 14 9.5 14z" />
              </svg>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </span>
          }
        >
          <div className="divide-y divide-[#e9edef] bg-white">
            {item.chats.map((chat) => (
              <div key={chat.name} className="flex items-center gap-2 px-2.5 py-2">
                <div className="h-7 w-7 shrink-0 rounded-full bg-[#dfe5e7]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="truncate text-[10px] font-medium text-[#111b21]">{chat.name}</p>
                    <span className="shrink-0 text-[8px] font-medium text-[#25D366]">{chat.time}</span>
                  </div>
                  <p className="truncate text-[9px] text-[#667781]">{chat.preview}</p>
                </div>
                <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1 text-[8px] font-semibold text-white">
                  {chat.unread}
                </span>
              </div>
            ))}
          </div>
        </ChatWindow>
      </div>
    </div>
  );
}

export function ScatteredOrderPreview({ item }: { item: LostItem }) {
  return (
    <div className="relative mx-auto h-[14.75rem] w-full max-w-[17.5rem]">
      <div className="flex h-full items-center justify-center pr-12">
        <ChatWindow title={item.chat.name}>
          <div className="space-y-1.5 bg-[#e5ddd5] p-2">
            {item.chat.messages.map((msg) => (
              <WhatsAppMessage key={msg.text} small>
                {msg.text}
              </WhatsAppMessage>
            ))}
            <div className="rounded-lg border border-dashed border-sky-400 bg-white/90 px-2.5 py-2 text-[9px] leading-4 text-slate-500">
              {item.fragments.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
        </ChatWindow>
      </div>
      <div className="pointer-events-none absolute -right-0.5 top-14 z-20 w-[7.75rem] sm:top-12 sm:w-[8.5rem]">
        <p className="rotate-[4deg] font-handwritten text-[15px] font-semibold leading-[1.2] text-[#0b2b52] sm:text-[17px]">
          {item.note}
        </p>
        <svg
          className="-ml-4 mt-1 h-8 w-10 text-sky-500"
          viewBox="0 0 40 32"
          fill="none"
          aria-hidden
        >
          <path
            d="M32 5C22 10 12 16 8 28"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <g transform="rotate(-35 8 28)">
            <path
              d="M8 28L14 21M8 28L16 27"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
