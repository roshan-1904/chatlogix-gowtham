import type { ReactNode } from 'react';
import { hero } from '../../copy';
import { PhoneDemoFrame } from '../phone/PhoneDemoFrame';

type PreviewVariant = 'before' | 'after';

export function HeroPhoneColumn({
  variant,
  children,
}: {
  variant: PreviewVariant;
  children: ReactNode;
}) {
  const isAfter = variant === 'after';
  const label = isAfter ? hero.previewTabs.after : hero.previewTabs.before;

  return (
    <div className="flex w-full min-w-0 flex-col items-center lg:items-stretch">
      <p
        className={`mb-2 w-full text-center text-[13px] font-bold leading-tight tracking-tight sm:mb-2.5 sm:text-[15px] lg:mb-3 lg:text-base xl:text-[1.125rem] ${
          isAfter ? 'text-[#128C7E]' : 'text-[#072349]'
        }`}
      >
        {label}
      </p>
      {/* `--phone-demo-w` is set once on `.hero-mobile-preview` so both columns match. */}
      <PhoneDemoFrame className="relative overflow-visible">{children}</PhoneDemoFrame>
    </div>
  );
}
