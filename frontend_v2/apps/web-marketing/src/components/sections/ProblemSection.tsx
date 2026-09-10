import { Fragment } from 'react';
import { problem } from '../../copy';
import { sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';
import { MarketingArrow } from '../marketing/MarketingArrow';
import { SectionShell } from '../SectionShell';
import { ProblemBusyDayCallout } from '../problem/ProblemBusyDayCallout';
import { ProblemCard } from '../problem/ProblemCard';
import { ProblemMiniPreview } from '../problem/ProblemMiniPreviews';

export function ProblemSection() {
  return (
    <SectionShell id="problem" viewport className="bg-white !py-3 sm:!py-4 lg:!py-5">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center overflow-hidden">
        <header className="relative grid min-w-0 shrink-0 items-start gap-2 overflow-visible lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-6">
          <div className="order-1 flex min-w-0 items-center justify-between gap-3 lg:block">
            <p className={`mb-0 ${sectionEyebrowClass} lg:mb-3`}>
              {problem.eyebrow}
            </p>
            <div className="shrink-0 lg:hidden">
              <ProblemBusyDayCallout compact />
            </div>
          </div>
          <div className="order-2 min-w-0 lg:col-start-1 lg:row-start-2">
            <h2 className={sectionHeadingClass}>
              <span className="block">{problem.headlineLine1}</span>
              <span className="mt-1 block text-[#128C7E] sm:mt-1.5">{problem.headlineLine2}</span>
            </h2>
            <p className={`mt-2.5 max-w-3xl sm:mt-3 ${sectionBodyClass}`}>
              {problem.intro}
            </p>
          </div>
          {/*
            `lg:pt-1 lg:pr-1` keeps the callout's -3deg rotation clear of the section's
            `overflow-hidden` inner. Rotation grows the visual box beyond the laid-out
            one, and on the short/narrow `lg` bands the header sits flush against the top
            of that inner, so without the inset the note lost ~3px off its top edge.
          */}
          <div className="hidden min-w-0 overflow-visible lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:justify-self-end lg:pr-1 lg:pt-1">
            <ProblemBusyDayCallout />
          </div>
        </header>

        {/*
          Three cards only from `lg`; at `md` two columns keep each card wide enough for its
          mini WhatsApp frame. The connector arrows cost ~96px of card width, which is what
          pushes card titles onto a second line, so they wait until 1360px — below that the
          three cards take the full row.
        */}
        <div className="mt-4 grid min-w-0 grid-cols-1 items-stretch gap-3 sm:mt-5 md:grid-cols-2 lg:mt-6 lg:grid-cols-3 min-[1360px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          {problem.items.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 ? (
                <div className="hidden items-center justify-center text-slate-300 min-[1360px]:flex" aria-hidden>
                  <MarketingArrow className="h-5 w-8" />
                </div>
              ) : null}
              <ProblemCard item={item} index={index} preview={<ProblemMiniPreview item={item} />} />
            </Fragment>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
