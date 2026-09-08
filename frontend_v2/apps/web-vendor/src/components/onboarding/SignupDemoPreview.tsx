import { onboardingCopy } from './onboardingCopy';

function VoiceNoteBubble({ label, duration }: { label: string; duration: string }) {
  return (
    <div className="flex max-w-[92%] items-center gap-2.5 rounded-2xl rounded-tr-md bg-[#DCF8C6] px-3 py-2 shadow-sm">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary-500 text-white"
        aria-hidden
      >
        <svg className="h-3 w-3 ml-0.5" viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 2.2v7.6L10.2 6 3 2.2z" />
        </svg>
      </span>
      <span className="flex h-5 items-end gap-[3px]" aria-hidden>
        {[5, 9, 6, 14, 8, 12, 7, 11, 5, 10, 6].map((h, i) => (
          <span
            key={`${h}-${i}`}
            className="w-[3px] rounded-full bg-primary-500/60"
            style={{ height: `${h}px` }}
          />
        ))}
      </span>
      <span className="text-[11px] font-medium text-gray-700">
        {label} · {duration}
      </span>
    </div>
  );
}

interface SignupDemoPreviewProps {
  compact?: boolean;
  className?: string;
}

export function SignupDemoPreview({ compact = false, className = '' }: SignupDemoPreviewProps) {
  const { preview } = onboardingCopy.signup.marketing;

  return (
    <div className={`${compact ? 'mt-4' : 'mt-8'} ${className}`} aria-hidden>
      {compact ? null : (
        <p className="mb-3 text-center text-base font-semibold text-gray-900">{preview.title}</p>
      )}

      {compact ? null : (
        <ol className="relative mb-4 grid grid-cols-3">
          <span className="absolute left-[16.666%] right-[16.666%] top-3.5 h-px bg-gray-200" />
          {preview.steps.map((step, index) => (
            <li key={step.title} className="relative z-10 flex flex-col items-center px-2 text-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <p className="mt-2 text-xs font-semibold text-gray-900">{step.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{step.body}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md">
        <div className="flex items-center gap-3 bg-primary-500 px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
            {preview.chatName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{preview.chatName}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary-500" />
              {preview.status}
            </p>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-2.5 text-white/95" aria-hidden>
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.02l-2.2 2.21z" />
            </svg>
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </span>
        </div>

        <div className={`chat-canvas space-y-2.5 px-3.5 ${compact ? 'py-3' : 'py-4'}`}>
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-[#DCF8C6] px-3 py-2 text-xs leading-relaxed text-gray-900 shadow-sm">
              {preview.customerText}
            </p>
          </div>
          <div className="flex justify-start">
            <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3 py-2 text-xs leading-relaxed text-gray-900 shadow-sm">
              {preview.assistantText}
            </p>
          </div>
          {compact ? null : (
            <>
              <div className="flex justify-end">
                <VoiceNoteBubble label={preview.voiceLabel} duration={preview.voiceDuration} />
              </div>
              <div className="flex justify-start">
                <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3 py-2 text-xs leading-relaxed text-gray-900 shadow-sm">
                  {preview.assistantFollowUp}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-2.5">
          <div className="flex-1 rounded-full bg-gray-100 px-3.5 py-2 text-xs text-gray-400">
            {preview.composer}
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-500 text-white">
            <svg className="h-3.5 w-3.5 ml-0.5" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1.2 10.8 10.8 6 1.2 1.2 1.2 5l6 1-6 1z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
