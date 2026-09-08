import type { ComponentType } from 'react';
import { CartOrderIcon, LightningIcon, ThreadIcon } from '../hero/HeroIcons';
import { HowItWorksStepPreview } from '../how-it-works/HowItWorksMocks';
import { SectionShell } from '../SectionShell';
import { howItWorks } from '../../copy';
import { sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';

const highlightIconById: Record<
  string,
  { Icon: ComponentType<{ className?: string }>; wrap: string }
> = {
  scale: { Icon: ThreadIcon, wrap: 'bg-emerald-50 text-[#0f6b5c]' },
  ops: { Icon: CartOrderIcon, wrap: 'bg-blue-50 text-blue-600' },
  takeover: { Icon: LightningIcon, wrap: 'bg-violet-50 text-violet-600' },
};

function DashedStepArrow() {
  return (
    <svg className="h-4 w-8" viewBox="0 0 32 16" fill="none" aria-hidden>
      <path
        d="M2 8H24"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2.5 2.5"
      />
      <path
        d="M20 4L25 8L20 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrustShield() {
  return (
    <svg className="h-7 w-7 text-[#0f6b5c] sm:h-8 sm:w-8" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2 4.5 5.2v6.3c0 4.9 3.2 9.2 7.5 10.5 4.3-1.3 7.5-5.6 7.5-10.5V5.2L12 2z"
      />
      <path fill="#fff" d="M10.3 14.6 7.8 12.1l1.2-1.2 1.3 1.3 3.7-3.7 1.2 1.2-4.9 4.9z" />
    </svg>
  );
}

export function HowItWorksSection() {
  return (
    <SectionShell
      id="how-it-works"
      viewport
      className="bg-white !py-3 sm:!py-4 lg:!py-5"
      innerClassName="max-lg:!justify-start max-lg:overflow-y-auto max-lg:[scrollbar-width:none] max-lg:[-ms-overflow-style:none] max-lg:[&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-full flex-col justify-start gap-5 sm:gap-6 lg:h-full lg:min-h-0 lg:flex-1 lg:justify-center lg:gap-8 xl:gap-9">
        <div className="mb-4 grid w-full shrink-0 items-start gap-4 sm:mb-5 lg:mb-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-x-10 xl:mb-8 xl:gap-x-12">
          <header className="min-w-0 text-left" data-hiw="copy">
            <p className={`mb-1.5 ${sectionEyebrowClass}`}>
              {howItWorks.eyebrow}
            </p>
            <h2 className={sectionHeadingClass}>
              {howItWorks.headlineBefore}
              <br />
              <span className="text-[#128C7E]">{howItWorks.headlineHighlight}</span>
            </h2>
            <p className={`mt-2.5 max-w-xl sm:mt-3 ${sectionBodyClass}`}>
              {howItWorks.body}
            </p>
          </header>

          <div className="flex min-w-0 flex-col gap-3">
            <div
              className="flex items-center gap-3 rounded-2xl bg-[#e7f6f1] px-3.5 py-3 sm:px-4"
              data-hiw="trust"
            >
              <span className="flex shrink-0 items-center justify-center">
                <TrustShield />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-primary-500 sm:text-sm">{howItWorks.trustLine}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600 sm:text-xs sm:leading-5">
                  {howItWorks.trustSubline}
                </p>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 lg:gap-2" data-hiw="highlights">
              {howItWorks.highlights.map((item) => {
                const config = highlightIconById[item.id];
                if (!config) return null;
                const { Icon, wrap } = config;
                return (
                  <div key={item.id} className="flex gap-2">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${wrap}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[13px] font-semibold leading-snug text-primary-500 sm:text-[14px]">{item.title}</h3>
                      <p className="mt-0.5 text-[12px] leading-5 text-slate-600 sm:text-[13px]">{item.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <ol
          className="grid min-h-0 grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-4 lg:gap-y-0 xl:gap-x-5"
          data-hiw="steps"
        >
          {howItWorks.steps.map((step, index) => (
            <li key={step.id} className="relative flex min-h-0 min-w-0 flex-col">
              <div className="mb-2.5 flex shrink-0 items-start gap-1.5 lg:h-[5.25rem]">
                <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#128C7E] text-[11px] font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold leading-snug text-primary-500 sm:text-[14px] lg:truncate">{step.title}</h3>
                  <p className="mt-0.5 text-[12px] leading-5 text-slate-600 sm:text-[13px] lg:line-clamp-3">{step.body}</p>
                </div>
              </div>
              <div className="relative flex min-h-[10.5rem] flex-1 flex-col lg:min-h-[12.5rem]">
                {index > 0 ? (
                  <div
                    className="pointer-events-none absolute -left-2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 text-slate-300 lg:flex xl:-left-2.5"
                    aria-hidden
                  >
                    <DashedStepArrow />
                  </div>
                ) : null}
                <HowItWorksStepPreview id={step.id} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  );
}
