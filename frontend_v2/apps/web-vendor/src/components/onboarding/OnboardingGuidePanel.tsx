import type { ReactNode } from 'react';

export interface OnboardingGuideCopy {
  kicker: string;
  h1: string;
  subhead: string;
  actionTitle: string;
  howTo: ReadonlyArray<{ title: string; body: string }>;
  footnote?: string;
}

interface OnboardingGuidePanelProps {
  copy: OnboardingGuideCopy;
  visual?: ReactNode;
  compact?: boolean;
}

export function OnboardingGuidePanel({ copy, visual, compact = false }: OnboardingGuidePanelProps) {
  if (compact) {
    return (
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-secondary-600">{copy.kicker}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance text-gray-900">{copy.h1}</h1>
        <ol className="mt-4 space-y-3">
          {copy.howTo.map((item, index) => (
            <li key={item.title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-gray-500">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="text-sm font-medium uppercase tracking-wide text-secondary-600">{copy.kicker}</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-balance text-primary-500 xl:text-[2.6rem]">
        {copy.h1}
      </h1>
      <p className="mt-4 max-w-[42rem] text-base leading-relaxed text-gray-600">{copy.subhead}</p>

      <ol className="relative mt-8 grid grid-cols-3">
        <span className="absolute left-[16.666%] right-[16.666%] top-3.5 h-px bg-gray-200" />
        {copy.howTo.map((item, index) => (
          <li key={item.title} className="relative z-10 flex flex-col items-center px-2 text-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-[11px] font-semibold text-white">
              {index + 1}
            </span>
            <p className="mt-2 text-xs font-semibold text-gray-900">{item.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{item.body}</p>
          </li>
        ))}
      </ol>

      {visual ? <div className="mt-8">{visual}</div> : null}

      {copy.footnote ? (
        <p className="mt-8 text-sm leading-relaxed text-gray-500">{copy.footnote}</p>
      ) : null}
    </div>
  );
}

interface OnboardingGuideChatPreviewProps {
  chatName: string;
  status: string;
  customerText: string;
  assistantText: string;
}

export function OnboardingGuideChatPreview({
  chatName,
  status,
  customerText,
  assistantText,
}: OnboardingGuideChatPreviewProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md" aria-hidden>
      <div className="flex items-center gap-3 bg-primary-500 px-4 py-3 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
          {chatName.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{chatName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary-500" />
            {status}
          </p>
        </div>
      </div>
      <div className="chat-canvas space-y-2.5 px-3.5 py-4">
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-[#DCF8C6] px-3 py-2 text-xs leading-relaxed text-gray-900 shadow-sm">
            {customerText}
          </p>
        </div>
        <div className="flex justify-start">
          <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3 py-2 text-xs leading-relaxed text-gray-900 shadow-sm">
            {assistantText}
          </p>
        </div>
      </div>
    </div>
  );
}
