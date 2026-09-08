import { useState } from 'react';
import { SectionShell } from '../SectionShell';
import { MarketingFooter } from '../MarketingFooter';
import { PortalCta } from '../PortalCta';
import { FaqCategoryColumn } from '../faq/FaqCategoryColumn';
import { FaqCartIcon, FaqMessageIcon, FaqRocketIcon } from '../faq/FaqIcons';
import { TryGiftIcon } from '../try/TryIcons';
import { faq } from '../../copy';
import { site } from '../../lib/site';
import { sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';

const categoryConfig = [
  { Icon: FaqRocketIcon, accent: 'emerald' as const },
  { Icon: FaqMessageIcon, accent: 'blue' as const },
  { Icon: FaqCartIcon, accent: 'violet' as const },
];

function FaqEyebrow() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#e7f6f1] px-3 py-1">
      <span className={sectionEyebrowClass}>{faq.eyebrow}</span>
    </span>
  );
}

function FaqCtaBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#e7f6f1] p-5 sm:p-6">
      <div
        className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-56 rounded-full bg-[#128C7E]/15 blur-2xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#128C7E] sm:h-12 sm:w-12">
            <TryGiftIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#128C7E] sm:text-[11px]">
              {faq.cta.eyebrow}
            </p>
            <h3 className="mt-1 text-[17px] font-extrabold leading-snug text-primary-500 sm:text-[20px]">
              {faq.cta.headline}
            </h3>
            <p className="mt-1 text-[12px] text-slate-600 sm:text-[13px]">{faq.cta.body}</p>
          </div>
        </div>
        <PortalCta
          href={site.urls.tryFree}
          size="lg"
          className="w-full shrink-0 gap-2 whitespace-nowrap text-[14px] font-semibold sm:w-auto"
        >
          {faq.cta.button}
          <span aria-hidden>→</span>
        </PortalCta>
      </div>
    </div>
  );
}

export function FaqCtaSection() {
  const [openKey, setOpenKey] = useState('0-0');

  return (
    <SectionShell
      id="faq"
      viewport
      className="bg-gray-50 !py-0"
      innerClassName="max-lg:!justify-start overflow-x-hidden overflow-y-auto py-3 sm:py-4 lg:overflow-hidden lg:py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      footer={<MarketingFooter />}
    >
      <div className="flex w-full flex-col gap-5 lg:h-full lg:min-h-0 lg:justify-center lg:gap-6">
        <header className="mx-auto w-full max-w-4xl text-center lg:max-w-5xl">
          <FaqEyebrow />
          <h2 className={`mt-3 ${sectionHeadingClass}`}>
            <span className="lg:whitespace-nowrap">{faq.headlineBefore}</span>
            <span className="mt-1 block text-[#128C7E]">{faq.headlineHighlight}</span>
          </h2>
          <p className={`mx-auto mt-2.5 max-w-xl ${sectionBodyClass}`}>{faq.subtext}</p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          {faq.categories.map((category, categoryIndex) => {
            const { Icon, accent } = categoryConfig[categoryIndex];
            return (
              <FaqCategoryColumn
                key={category.id}
                category={category}
                Icon={Icon}
                accent={accent}
                isItemOpen={(itemIndex) => openKey === `${categoryIndex}-${itemIndex}`}
                onToggleItem={(itemIndex) => {
                  const key = `${categoryIndex}-${itemIndex}`;
                  setOpenKey((current) => (current === key ? '' : key));
                }}
              />
            );
          })}
        </div>

        <FaqCtaBanner />
      </div>
    </SectionShell>
  );
}
