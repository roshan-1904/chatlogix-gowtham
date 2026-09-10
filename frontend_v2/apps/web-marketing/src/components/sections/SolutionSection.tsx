import type { ComponentType, ReactNode } from 'react';
import { CatalogIcon, CartOrderIcon, ThreadIcon } from '../hero/HeroIcons';
import { SectionShell } from '../SectionShell';
import { solution } from '../../copy';
import { sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';
import { SolutionVisual } from '../solution/SolutionVisual';

const solutionIconById: Record<
  string,
  { Icon: ComponentType<{ className?: string }>; wrap: string }
> = {
  catalog: { Icon: CatalogIcon, wrap: 'bg-emerald-50 text-emerald-600' },
  memory: { Icon: ThreadIcon, wrap: 'bg-blue-50 text-blue-600' },
  orders: { Icon: CartOrderIcon, wrap: 'bg-violet-50 text-violet-600' },
};

function Benefit({
  icon,
  title,
  description,
  iconClass,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  iconClass: string;
}) {
  return (
    <div className="flex gap-3 sm:gap-3.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${iconClass}`}
      >
        {icon}
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-primary-500 sm:text-[14px]">{title}</h3>
        <p className="mt-0.5 text-[12px] leading-5 text-slate-600 sm:text-[13px]">{description}</p>
      </div>
    </div>
  );
}

function TrustShield() {
  return (
    <svg className="h-9 w-9 text-[#0f6b5c]" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2 4.5 5.2v6.3c0 4.9 3.2 9.2 7.5 10.5 4.3-1.3 7.5-5.6 7.5-10.5V5.2L12 2z"
      />
      <path fill="#fff" d="M10.3 14.6 7.8 12.1l1.2-1.2 1.3 1.3 3.7-3.7 1.2 1.2-4.9 4.9z" />
    </svg>
  );
}

function TrustChip() {
  return (
    <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#e7f6f1] px-3.5 py-3 sm:mt-7 sm:px-4 sm:py-3.5">
      <span className="flex shrink-0 items-center justify-center">
        <TrustShield />
      </span>
      <div>
        <p className="text-[13px] font-semibold text-primary-500 sm:text-sm">{solution.trustLine}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-600 sm:text-xs sm:leading-5">{solution.trustSubline}</p>
      </div>
    </div>
  );
}

export function SolutionSection() {
  return (
    <SectionShell
      id="product"
      viewport
      className="bg-white !py-3 sm:!py-4 lg:!py-5"
      innerClassName="max-lg:!justify-start"
    >
      {/*
        Column ratio is load-bearing: the headline needs >=560px at `xl` to keep its
        designed three-line wrap at 1440, which is exactly what 0.9fr gives. The
        handwriting gutters come out of the visual column instead (see `SolutionVisual`).
      */}
      <div className="flex min-h-0 w-full flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-6 xl:gap-8">
        <div className="min-w-0 shrink-0 lg:shrink">
          <p className={`mb-2 sm:mb-3 ${sectionEyebrowClass}`}>
            {solution.eyebrow}
          </p>
          <h2 className={`${sectionHeadingClass} max-w-2xl`}>
            {solution.headlineBefore}
            <span className="text-[#128C7E]">{solution.headlineHighlight}</span>
            {solution.headlineAfter}
          </h2>
          <p className={`mt-3 max-w-xl sm:mt-4 ${sectionBodyClass}`}>
            {solution.body}
          </p>

          <div className="mt-5 space-y-4 sm:mt-7 sm:space-y-6">
            {solution.bullets.map((bullet) => {
              const config = solutionIconById[bullet.id];
              if (!config) return null;
              const { Icon, wrap } = config;
              return (
                <Benefit
                  key={bullet.id}
                  icon={<Icon className="h-5 w-5 sm:h-[21px] sm:w-[21px]" />}
                  title={bullet.title}
                  description={bullet.body}
                  iconClass={wrap}
                />
              );
            })}
          </div>

          <TrustChip />
        </div>

        <div className="relative flex min-w-0 shrink-0 items-center justify-center">
          <SolutionVisual />
        </div>
      </div>
    </SectionShell>
  );
}
