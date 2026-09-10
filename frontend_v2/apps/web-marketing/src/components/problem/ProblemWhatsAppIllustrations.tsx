import type { ReactNode } from 'react';
import type { problem } from '../../copy';
import {
  problemCardPreviewAreaClass,
  problemNoteColumnClass,
  problemPillColumnClass,
  problemPreviewShellClass,
} from '../../lib/problemLayout';
import { WaChatHeaderActions } from '../hero/whatsapp/WhatsAppPhoneShell';

type ProblemItem = (typeof problem.items)[number];
type RepeatItem = Extract<ProblemItem, { id: 'repeat' }>;
type MissedItem = Extract<ProblemItem, { id: 'missed' }>;
type LostItem = Extract<ProblemItem, { id: 'lost' }>;

function ProfileDot() {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 sm:h-6 sm:w-6"
      aria-hidden
    >
      <svg className="h-3 w-3 text-white sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="currentColor">
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

/**
 * Local bubble instead of `WhatsAppMessage`: these mini frames are only ~200px wide below
 * `xl`, so they need tighter type and padding than the shared component. At `xl+` the
 * sizing matches `WhatsAppMessage small` exactly.
 */
function MiniBubble({ children, mine = false }: { children: ReactNode; mine?: boolean }) {
  return (
    <div
      className={`w-fit max-w-[94%] rounded-lg px-2 py-1 text-[10px] leading-snug shadow-sm sm:px-2.5 sm:py-1.5 sm:text-[11px] xl:max-w-[88%] xl:px-3 xl:py-2 xl:text-xs ${
        mine ? 'ml-auto bg-[#d9ffc9]' : 'mr-auto bg-white'
      }`}
    >
      {children}
    </div>
  );
}

function ChatWindow({
  title,
  subtitle,
  children,
  trailing,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className={problemPreviewShellClass}>
      <div className="flex items-center gap-1.5 bg-[#008069] px-2 py-1.5 text-white sm:gap-2 sm:px-2.5 sm:py-2">
        <ProfileDot />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-semibold leading-tight sm:text-[10px] xl:text-[11px]" title={title}>
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-[7px] leading-tight text-white/80 sm:text-[8px]">{subtitle}</p>
          ) : null}
        </div>
        {trailing ?? <WaChatHeaderActions size="sm" />}
      </div>
      {children}
    </div>
  );
}

function RosePills({ tags }: { tags: readonly string[] }) {
  const rotations = ['-rotate-[5deg]', 'rotate-[4deg]', '-rotate-[4deg]', 'rotate-[5deg]'];

  return (
    <div className={`${problemPillColumnClass} justify-between`} aria-hidden>
      {tags.map((tag, i) => (
        <span key={tag} className={`inline-flex max-w-full items-center gap-0.5 ${rotations[i] ?? ''}`}>
          <Sparkles className="shrink-0 text-rose-400" />
          <span className="min-w-0 truncate rounded-full border border-rose-200 bg-[#fde2e2] px-1.5 py-0.5 text-[8px] font-semibold text-[#b42318] shadow-sm sm:text-[9px] xl:px-2 xl:text-[10px]">
            {tag}
          </span>
        </span>
      ))}
    </div>
  );
}

function AmberNotes({ tags }: { tags: readonly string[] }) {
  const rotations = ['rotate-[2deg]', '-rotate-[2deg]', 'rotate-[3deg]', '-rotate-[2deg]'];

  return (
    <div className={`${problemNoteColumnClass} justify-between`} aria-hidden>
      {tags.map((tag, i) => (
        <span key={tag} className={`inline-flex max-w-full items-start gap-0.5 ${rotations[i] ?? ''}`}>
          <Sparkles className="mt-0.5 shrink-0 text-amber-400" />
          <span className="min-w-0 rounded-lg border border-amber-200 bg-[#fde7c7] px-1.5 py-0.5 text-[8px] font-semibold leading-tight text-[#9a3412] shadow-sm sm:text-[9px] xl:rounded-xl xl:px-2 xl:py-1 xl:text-[10px]">
            {tag}
          </span>
        </span>
      ))}
    </div>
  );
}

export function RepetitiveQuestionsPreview({ item }: { item: RepeatItem }) {
  return (
    <div className={problemCardPreviewAreaClass}>
      <RosePills tags={item.tags} />
      <ChatWindow title={item.chat.name}>
        <div className="flex-1 space-y-1 bg-[#e5ddd5] p-1.5 sm:space-y-1.5 sm:p-2">
          {item.chat.messages.map((msg, i) => (
            <MiniBubble key={`${msg.text}-${i}`} mine={msg.from === 'shop'}>
              {msg.text}
            </MiniBubble>
          ))}
        </div>
      </ChatWindow>
    </div>
  );
}

export function UnreadInboxPreview({ item }: { item: MissedItem }) {
  return (
    <div className={problemCardPreviewAreaClass}>
      <ChatWindow
        title="WhatsApp"
        subtitle="99+ unread messages"
        trailing={
          <span className="ml-auto flex shrink-0 items-center gap-1 text-white/90 sm:gap-1.5" aria-hidden>
            <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 5 1.5-1.5-5-5zM9.5 14C7 14 5 12 5 9.5S7 5 9.5 5 14 7 14 9.5 12 14 9.5 14z" />
            </svg>
            <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </span>
        }
      >
        <div className="flex-1 divide-y divide-[#e9edef] bg-white">
          {item.chats.map((chat) => (
            <div key={chat.name} className="flex items-center gap-1.5 px-1.5 py-1 sm:gap-2 sm:px-2.5 sm:py-1.5 xl:py-2">
              <div className="h-5 w-5 shrink-0 rounded-full bg-[#dfe5e7] sm:h-6 sm:w-6 xl:h-7 xl:w-7" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-1">
                  <p className="truncate text-[9px] font-medium text-[#111b21] sm:text-[10px]">{chat.name}</p>
                  <span className="shrink-0 text-[7px] font-medium text-[#25D366] sm:text-[8px]">{chat.time}</span>
                </div>
                <p className="truncate text-[8px] text-[#667781] sm:text-[9px]">{chat.preview}</p>
              </div>
              <span className="flex h-3.5 min-w-[14px] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1 text-[7px] font-semibold text-white sm:h-4 sm:min-w-[16px] sm:text-[8px]">
                {chat.unread}
              </span>
            </div>
          ))}
        </div>
      </ChatWindow>
      <AmberNotes tags={item.tags} />
    </div>
  );
}

export function ScatteredOrderPreview({ item }: { item: LostItem }) {
  return (
    <div className={problemCardPreviewAreaClass}>
      <ChatWindow title={item.chat.name}>
        <div className="flex-1 space-y-1 bg-[#e5ddd5] p-1.5 sm:space-y-1.5 sm:p-2">
          {item.chat.messages.map((msg) => (
            <MiniBubble key={msg.text}>{msg.text}</MiniBubble>
          ))}
          <div className="rounded-lg border border-dashed border-sky-400 bg-white/90 px-2 py-1.5 text-[8px] leading-[1.35] text-slate-500 sm:px-2.5 sm:py-2 sm:text-[9px] sm:leading-4">
            {item.fragments.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      </ChatWindow>
      <div className={`${problemNoteColumnClass} justify-center`} aria-hidden>
        <p className="font-handwritten text-[12px] font-semibold leading-[1.25] text-[#0b2b52] sm:text-[13px] xl:text-[15px]">
          {item.note}
        </p>
        <svg className="-ml-3 mt-1 h-7 w-9 shrink-0 text-sky-500 xl:h-8 xl:w-10" viewBox="0 0 40 32" fill="none" aria-hidden>
          <path d="M32 5C22 10 12 16 8 28" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
