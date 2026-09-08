import { hero } from '../../copy';
import { handwrittenCalloutClass } from '../../lib/pageLayout';
import { HeroPhoneColumn } from './HeroPhoneColumn';
import { HeroAfterDemo } from './whatsapp/HeroAfterDemo';
import { HeroBeforeDemo } from './whatsapp/HeroBeforeDemo';
import { HeroDemoPopupSyncProvider } from './whatsapp/HeroDemoPopupSync';

const ANNOTATION_STROKE = '#909090';
const ARROW_STROKE = 2;

function HeroTopCallout() {
  const { line1, line2 } = hero.previewAnnotations.before;

  return (
    <div className="relative z-20 h-[4.75rem] w-full overflow-visible sm:h-[5.5rem] lg:h-[6.25rem]" aria-hidden>
      <p className={`absolute right-[38%] top-0 rotate-1 text-right ${handwrittenCalloutClass} text-[#072349]/80 lg:right-[40%]`}>
        {line1}
        <br />
        {line2}
      </p>
    </div>
  );
}

function HeroBottomCallout() {
  const { line1, line2 } = hero.previewAnnotations.after;

  return (
    <div className="relative z-20 h-[4.75rem] w-full overflow-visible sm:h-[5.5rem] lg:mt-1 lg:h-[6.25rem]" aria-hidden>
      <p className={`absolute bottom-0 right-[28%] rotate-1 text-right ${handwrittenCalloutClass} text-[#128C7E] lg:right-[30%]`}>
        {line1}
        <br />
        {line2}
      </p>
    </div>
  );
}

/** Top arrow: below text → left phone top-left (short arc, avoids striking text) */
function LeftPhoneTopArrow() {
  return (
    <svg
      className="hero-short-hide pointer-events-none absolute -top-[6.5rem] left-0 z-30 hidden h-[8.25rem] w-[72%] overflow-visible lg:block"
      viewBox="0 0 120 52"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M 88 18 C 76 14, 54 11, 36 20 C 24 28, 16 36, 14 41"
        stroke={ANNOTATION_STROKE}
        strokeWidth={ARROW_STROKE}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <g transform="rotate(-30 14 41)">
        <path
          d="M 14 41 L 18 36 M 14 41 L 20 40"
          stroke={ANNOTATION_STROKE}
          strokeWidth={ARROW_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

/** Bottom arrow: below "conversion." → right phone bottom-right (Ananya row) */
function RightPhoneBottomArrow() {
  return (
    <svg
      className="hero-short-hide pointer-events-none absolute -bottom-[6.75rem] left-0 z-30 hidden h-[7.5rem] w-full overflow-visible lg:block"
      viewBox="0 0 120 52"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M 35 35 Q 92 52, 104 9"
        stroke={ANNOTATION_STROKE}
        strokeWidth={ARROW_STROKE}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <g transform="rotate(-25 104 9)">
        <path
          d="M 104 9 L 99 12 M 104 9 L 101 14"
          stroke={ANNOTATION_STROKE}
          strokeWidth={ARROW_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

export function HeroDualPreview() {
  return (
    <div
      aria-label={hero.previewLabel}
      className="hero-mobile-preview relative mx-auto w-full max-w-[19.5rem] sm:max-w-[21rem] lg:max-w-[min(100%,920px)] xl:max-w-[980px]"
    >
      <HeroDemoPopupSyncProvider>
        <div className="relative z-0 grid w-full grid-cols-2 gap-x-3 sm:gap-x-4 lg:gap-x-5 xl:gap-x-8 2xl:gap-x-10">
          <div className="hero-short-hide relative z-20 order-1 col-span-2 hidden overflow-visible lg:block">
            <HeroTopCallout />
          </div>

          <div className="relative z-10 order-2 min-w-0 overflow-visible">
            <LeftPhoneTopArrow />
            <HeroPhoneColumn variant="before">
              <HeroBeforeDemo size="dual" />
            </HeroPhoneColumn>
          </div>

          <div className="relative z-10 order-3 min-w-0 overflow-visible">
            <HeroPhoneColumn variant="after">
              <HeroAfterDemo size="dual" />
            </HeroPhoneColumn>
            <RightPhoneBottomArrow />
          </div>

          <div className="hero-short-hide relative z-20 order-4 col-span-2 hidden overflow-visible lg:block">
            <HeroBottomCallout />
          </div>
        </div>
      </HeroDemoPopupSyncProvider>
    </div>
  );
}
