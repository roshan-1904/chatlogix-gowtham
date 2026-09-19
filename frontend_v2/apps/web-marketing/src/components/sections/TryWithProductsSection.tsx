import { HandDrawnUnderline } from '../solution/HandDrawnUnderline';
import { SectionShell } from '../SectionShell';
import { PortalCta } from '../PortalCta';
import { TrustLockIcon } from '../trust/TrustIcons';
import {
  TryBoxIcon,
  TryCardIcon,
  TryChatIcon,
  TryCheckCircleIcon,
  TryChevronIcon,
  TryFilledArrowIcon,
  TryGiftIcon,
  TryPersonAddIcon,
  TrySparkleIcon,
} from '../try/TryIcons';
import { tryWithProducts } from '../../copy';
import { site } from '../../lib/site';
import { handwrittenCalloutClass, sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';

const stepIcons = [TryPersonAddIcon, TryBoxIcon, TryChatIcon, TryCheckCircleIcon];
const trustRowIcons = [TrustLockIcon, TryCardIcon];

function TryEyebrow() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6f1] px-3 py-1">
      <TryGiftIcon className="h-3.5 w-3.5 text-[#128C7E]" />
      <span className={sectionEyebrowClass}>{tryWithProducts.eyebrow}</span>
    </span>
  );
}

function JourneySteps() {
  return (
    // 2x2 up to the tablet band: four `w-[7rem]` columns wrapped into 3 + 1 with the
    // chevron of the wrapped item pointing at nothing. Four across returns at `lg`,
    // where the copy column is wide enough to hold them.
    <ol className="mt-5 grid grid-cols-2 items-start gap-x-2 gap-y-4 lg:grid-cols-4 lg:gap-x-1">
      {tryWithProducts.journey.map((step, index) => {
        const Icon = stepIcons[index];
        return (
          <li key={step.title} className="flex min-w-0 items-start">
            <div className="mx-auto flex min-w-0 flex-1 flex-col items-center gap-2 text-center max-lg:max-w-[11rem]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e7f6f1] text-[#128C7E] sm:h-12 sm:w-12">
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-[12px] font-bold leading-snug text-primary-500 sm:text-[13px]">
                {index + 1}. {step.title}
              </p>
              <p className="text-[10.5px] leading-4 text-slate-600 sm:text-[11.5px]">{step.body}</p>
            </div>
            {index < tryWithProducts.journey.length - 1 ? (
              <span className="mt-5 hidden shrink-0 px-1 text-gray-300 lg:block" aria-hidden>
                <TryChevronIcon className="h-4 w-4" />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function TryNote() {
  return (
    // The underline is absolute at `1.2em` with a `0.7em` height, so it ends ~0.7em
    // below a `leading-[1.18]` line box. Reserving that as padding keeps it inside the
    // paragraph instead of leaking ~20px of scroll overflow into the section inner.
    <p className={`relative mt-6 inline-block text-primary-500 lg:pb-[0.85em] ${handwrittenCalloutClass}`}>
      {tryWithProducts.note}
      <HandDrawnUnderline className="top-[1.2em]" />
    </p>
  );
}

function OfferCard() {
  return (
    <div className="relative">
      {/* The glow used to be `w-[130%]`, which pushed 33px past the viewport at 390.
          Layout width now stops at the card; the blur still spreads past it visually. */}
      <div
        className="pointer-events-none absolute -top-10 left-1/2 h-40 w-full -translate-x-1/2 rounded-full bg-[#128C7E]/10 blur-2xl"
        aria-hidden
      />
      <span className="pointer-events-none absolute -right-1 -top-4 text-[#128C7E]/70" aria-hidden>
        <TrySparkleIcon className="h-8 w-10" />
      </span>
      <div className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_20px_45px_-25px_rgba(15,107,92,0.35)] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e7f6f1] text-[#128C7E]">
            <TryGiftIcon className="h-6 w-6" />
          </span>
          <h3 className="text-[17px] font-extrabold text-primary-500 sm:text-[19px]">{tryWithProducts.card.badge}</h3>
        </div>
        <p className="mt-3 text-[12px] leading-5 text-slate-600 sm:text-[13px]">{tryWithProducts.card.body}</p>
        <ul className="mt-4 space-y-2.5 rounded-xl bg-[#e7f6f1] px-3.5 py-3">
          {tryWithProducts.card.checklist.map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <TryFilledArrowIcon className="h-4 w-[1.35rem] shrink-0 text-[#128C7E] sm:h-5 sm:w-7" />
              <span className="text-[12px] font-medium text-primary-500 sm:text-[13px]">{item}</span>
            </li>
          ))}
        </ul>
        <PortalCta href={site.urls.tryFree} size="lg" className="mt-4 w-full gap-2 text-[14px] font-semibold">
          {tryWithProducts.card.cta}
          <span aria-hidden>→</span>
        </PortalCta>
        <p className="mt-3 text-[10px] leading-4 text-slate-500 sm:text-[11px]">{tryWithProducts.card.fineprint}</p>
      </div>
    </div>
  );
}

function TrustRow() {
  return (
    // Dividers only exist where the row is guaranteed to stay on one line. Below `xl`
    // the row wraps, and a `border-l` on the first item of a wrapped line reads as a
    // stray rule; `xl:flex-nowrap` keeps that case from ever arising above it.
    <ul className="mt-4 flex flex-wrap items-center justify-center gap-y-2 lg:justify-start xl:flex-nowrap">
      {tryWithProducts.trustRow.map((label, index) => {
        const Icon = trustRowIcons[index];
        return (
          <li
            key={label}
            className="flex min-w-0 items-center gap-1.5 border-gray-200 px-3 text-[11px] font-medium text-slate-600 first:pl-0 last:pr-0 sm:px-4 sm:text-[12px] xl:[&:not(:first-child)]:border-l"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary-500/70" />
            {label}
          </li>
        );
      })}
    </ul>
  );
}

export function TryWithProductsSection() {
  return (
    <SectionShell
      id="pricing"
      viewport
      className="bg-white !py-3 sm:!py-4 lg:!py-5"
      innerClassName="max-lg:!justify-start overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-full flex-col gap-6 lg:h-full lg:min-h-0 lg:justify-center lg:gap-7">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start lg:gap-10">
          <div>
            <TryEyebrow />
            <h2 className={`mt-3 ${sectionHeadingClass}`}>
              {tryWithProducts.headlineBefore}
              <span className="mt-1 block text-[#128C7E]">{tryWithProducts.headlineHighlight}</span>
            </h2>
            <p className={`mt-2.5 max-w-xl ${sectionBodyClass}`}>{tryWithProducts.body}</p>
            <JourneySteps />
            <TryNote />
          </div>
          <div className="min-w-0">
            <OfferCard />
            <TrustRow />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
