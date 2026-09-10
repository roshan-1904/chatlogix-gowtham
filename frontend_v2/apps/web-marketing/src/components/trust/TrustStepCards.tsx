import type { ReactNode } from 'react';
import { trust } from '../../copy';
import { chatChrome } from '../../lib/chatChrome';
import {
  TrustArrowIcon,
  TrustBrainIcon,
  TrustCatalogIcon,
  TrustCheckIcon,
  TrustDoubleCheckIcon,
  TrustPolicyIcon,
  TrustShieldIcon,
  TrustStockIcon,
  TrustTagIcon,
  TrustTruckIcon,
} from './TrustIcons';

const collectIconById = {
  catalog: { Icon: TrustCatalogIcon, wrap: 'bg-emerald-50 text-[#0f6b5c]' },
  pricing: { Icon: TrustTagIcon, wrap: 'bg-violet-50 text-violet-600' },
  delivery: { Icon: TrustTruckIcon, wrap: 'bg-orange-50 text-orange-600' },
  policies: { Icon: TrustPolicyIcon, wrap: 'bg-rose-50 text-rose-600' },
};

const numberAccentById = {
  collect: 'bg-emerald-50 text-[#0f6b5c]',
  analyse: 'bg-blue-50 text-blue-600',
  validate: 'bg-violet-50 text-violet-600',
  reply: 'bg-emerald-50 text-[#0f6b5c]',
};

function StepCard({
  id,
  number,
  title,
  body,
  children,
}: {
  id: keyof typeof numberAccentById;
  number: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <article className="relative flex h-full min-w-0 flex-col rounded-2xl border border-gray-200 bg-white px-3.5 pb-3.5 pt-6 sm:px-4 sm:pb-4 sm:pt-7">
      <span
        className={`absolute left-4 top-0 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums ring-2 ring-white sm:h-10 sm:w-10 sm:text-[13px] ${numberAccentById[id]}`}
      >
        {number}
      </span>
      <h3 className="text-[15px] font-extrabold leading-snug text-primary-500 sm:text-[17px]">{title}</h3>
      <p className="mt-1 text-[11px] leading-4 text-slate-600 sm:text-[12px] sm:leading-5">{body}</p>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </article>
  );
}

function CollectVisual() {
  return (
    <ul className="space-y-1.5">
      {trust.collectItems.map((item) => {
        const config = collectIconById[item.id];
        const { Icon, wrap } = config;
        return (
          <li key={item.id} className="flex items-center gap-2.5 rounded-full bg-gray-50 px-2 py-1.5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${wrap}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[12px] font-medium text-primary-500 sm:text-[13px]">{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function AnalyseVisual() {
  const [top, left, right, bottom] = trust.analyseItems;
  const chipClass =
    'absolute flex items-center justify-center rounded-lg border border-dashed border-[#cfe8e0] bg-[#f6fbf9] px-1.5 py-1.5 text-center text-[10px] font-medium leading-4 text-primary-500 sm:text-[11px]';
  const stubClass = 'absolute left-0 top-0 border-dashed border-emerald-200';

  return (
    <div className="relative mx-auto h-[9.25rem] w-full min-w-0 max-w-[13rem] sm:h-[10.5rem]">
      <div className={`${chipClass} left-1/2 top-0 w-[6.4rem] -translate-x-1/2`}>{top.label}</div>
      <div className={`${chipClass} bottom-0 left-1/2 w-[6.4rem] -translate-x-1/2`}>{bottom.label}</div>
      <div className={`${chipClass} left-0 top-1/2 w-[4.4rem] -translate-y-1/2`}>{left.label}</div>
      <div className={`${chipClass} right-0 top-1/2 w-[4.4rem] -translate-y-1/2`}>{right.label}</div>

      <div className="absolute left-1/2 top-1/2 h-0 w-0" aria-hidden>
        <span className={`${stubClass} h-4 w-px -translate-x-1/2 -translate-y-9 border-l`} />
        <span className={`${stubClass} h-4 w-px -translate-x-1/2 translate-y-5 border-l`} />
        <span className={`${stubClass} h-px w-4 -translate-x-9 -translate-y-1/2 border-t`} />
        <span className={`${stubClass} h-px w-4 translate-x-5 -translate-y-1/2 border-t`} />
        <span className="absolute left-0 top-0 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-50 text-[#0f6b5c]">
          <TrustBrainIcon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function ValidateVisual() {
  return (
    <div className="flex flex-col gap-2">
      {trust.checks.map((check, index) => (
        <div key={check.title}>
          {index > 0 ? (
            <div className="mb-2 flex justify-center text-[#128C7E]" aria-hidden>
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M2 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          ) : null}
          <div className="flex gap-2">
            <span className="mt-0.5 text-[#128C7E]">
              <TrustCheckIcon />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-primary-500 sm:text-[12px]">{check.title}</p>
              <p className="text-[10px] leading-4 text-slate-600 sm:text-[11px]">{check.body}</p>
            </div>
          </div>
        </div>
      ))}
      <div className="mt-1 flex items-start gap-2 rounded-xl bg-[#e7f6f1] px-2.5 py-2">
        <span className="mt-0.5 shrink-0 text-[#0f6b5c]">
          <TrustShieldIcon className="h-5 w-5" />
        </span>
        <p className="text-[10px] font-medium leading-4 text-primary-500 sm:text-[11px]">{trust.validateFooter}</p>
      </div>
    </div>
  );
}

function ReplyVisual() {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl bg-[#e5ddd5] p-2">
        <div className={`ml-auto max-w-[92%] px-2 py-1.5 ${chatChrome.outgoing} ${chatChrome.shadow}`}>
          <p className="text-[10px] leading-4 text-[#111b21] sm:text-[11px]">{trust.replyChat.customer}</p>
          <div className="mt-0.5 flex items-center justify-end gap-1">
            <span className="text-[9px] text-[#667781]">{trust.replyChat.customerTime}</span>
            <TrustDoubleCheckIcon className="h-2.5 w-3 text-[#53bdeb]" />
          </div>
        </div>
        <div className={`mt-1.5 max-w-[92%] px-2 py-1.5 ${chatChrome.incoming} ${chatChrome.shadow}`}>
          <p className="text-[10px] leading-4 text-[#111b21] sm:text-[11px]">{trust.replyChat.assistant}</p>
          <div className="mt-0.5 flex items-center justify-end">
            <span className="text-[9px] text-[#667781]">{trust.replyChat.assistantTime}</span>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          <TrustStockIcon />
        </span>
        <p className="text-[10px] leading-4 text-slate-600 sm:text-[11px]">{trust.storeLine}</p>
      </div>
    </div>
  );
}

const visualById = {
  collect: CollectVisual,
  analyse: AnalyseVisual,
  validate: ValidateVisual,
  reply: ReplyVisual,
};

export function TrustStepCards() {
  return (
    // Four across needs both width and height: at `xl` there is room by width alone,
    // and on a short laptop (<=860px tall) four across is also the *shortest* layout,
    // so it is the one that keeps the section inside one viewport at 1024-1279.
    <ol className="grid grid-cols-1 items-stretch gap-4 pt-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4 xl:gap-10 [@media(min-width:1024px)_and_(max-height:860px)]:grid-cols-4">
      {trust.steps.map((step, index) => {
        const Visual = visualById[step.id];
        return (
          <li key={step.id} className="flex h-full min-w-0 flex-col">
            <div className="relative flex min-h-0 flex-1 flex-col">
              {index > 0 ? (
                <div
                  className="pointer-events-none absolute left-[-1.25rem] top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 text-[#0f6b5c] xl:block"
                  aria-hidden
                >
                  <TrustArrowIcon />
                </div>
              ) : null}
              <StepCard id={step.id} number={step.number} title={step.title} body={step.body}>
                <Visual />
              </StepCard>
            </div>
            {/* Single column has no neighbour to line up with, so the empty note slot
                only reserves height from `sm`, where the cards sit in a row. */}
            <div
              className={`mt-2.5 sm:mt-3 sm:min-h-[3.75rem] lg:min-h-[4.25rem] ${
                step.note ? '' : 'hidden sm:block'
              }`}
            >
              {step.note ? (
                <p className="max-w-full origin-left -rotate-[4deg] whitespace-pre-line px-1 font-handwritten text-[1rem] font-bold leading-snug text-[#0f6b5c] sm:text-[1.2rem] lg:text-[1.35rem]">
                  {step.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
