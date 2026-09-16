import { pagePaddingX, sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';
import { heroPreviewSnapSectionClass, heroSnapSectionClass } from '../../lib/snapScroll';
import { HeroBubbleGrid, GiftIcon } from '../hero/HeroIcons';
import { HeroBulletList } from '../hero/HeroBulletList';
import { HeroDualPreview } from '../hero/HeroDualPreview';
import { PortalCta, TryFreeCta } from '../PortalCta';
import { hero } from '../../copy';

function PlayIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

/** Same chip on both heroes: `₹50 free trial balance, no card required`, next to the Try Free CTA. */
function HeroTrustChip({ className }: { className: string }) {
  return (
    <div
      className={`max-w-xl items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 ${className}`}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/12 text-[#128C7E]">
        <GiftIcon className="h-4 w-4" />
      </span>
      <p className="min-w-0 leading-relaxed">{hero.trustChip}</p>
    </div>
  );
}

function HeroCopy({ variant }: { variant: 'mobile' | 'desktop' }) {
  const isDesktop = variant === 'desktop';

  return (
    <div className="min-w-0 lg:py-1 xl:pr-8">
      <p className={sectionEyebrowClass}>
        {hero.eyebrow}
      </p>
      <h1 className={`${sectionHeadingClass} mt-2 sm:mt-3 lg:mt-3`}>
        <span className="block max-w-[24ch] sm:max-w-[18ch]">{hero.headlineLine1}</span>
        <span className="mt-1.5 block max-w-[24ch] text-[#128C7E] sm:mt-2 sm:max-w-[20ch]">
          {hero.headlineLine2}
        </span>
      </h1>
      <p className={`mt-2.5 max-w-[36ch] sm:mt-3 lg:mt-4 ${sectionBodyClass}`}>
        {hero.subtext}
      </p>
      {isDesktop ? (
        <>
          {/* Scaled, not hidden, on short laptops — see `.hero-short-bullets` in index.css. */}
          <div className="hero-short-bullets hidden lg:block">
            <HeroBulletList compact />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:flex-wrap sm:gap-3 lg:mt-5">
            <TryFreeCta size="lg" />
            <PortalCta href="/#how-it-works" variant="ghost" size="lg" className="justify-center gap-0">
              <PlayIcon />
              {hero.secondaryCta}
            </PortalCta>
          </div>
          <HeroTrustChip className="hero-short-trust mt-3 hidden lg:mt-4 lg:flex" />
        </>
      ) : (
        /*
          The mobile copy panel is its own full-viewport snap stop, so it needs enough to
          fill one: headline plus subtext alone left ~370px empty above the "swipe up" hint.
        */
        <HeroBulletList compact />
      )}
    </div>
  );
}

function MobileScrollHint() {
  return (
    <p className="mt-auto pt-6 text-center text-[11px] font-medium tracking-wide text-gray-400">
      Swipe up to see the demo
    </p>
  );
}

const heroSectionShell = `relative bg-[#f8f9fa] ${pagePaddingX}`;

export function HeroSection() {
  return (
    <>
      {/* Mobile snap 1: headline + copy */}
      <section id="hero-mobile" className={`${heroSectionShell} ${heroSnapSectionClass} lg:hidden`}>
        <HeroBubbleGrid className="opacity-60" />
        <div className="hero-snap-inner relative flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center px-0 py-2">
          <HeroCopy variant="mobile" />
          <div className="mt-5 sm:mt-6">
            <PortalCta href="#hero-preview" variant="ghost" size="lg" className="w-full justify-center gap-0 sm:w-auto">
              <PlayIcon />
              {hero.secondaryCta}
            </PortalCta>
          </div>
          <HeroTrustChip className="mt-4 flex" />
          <MobileScrollHint />
        </div>
      </section>

      {/* Mobile snap 2: phone demos */}
      <section id="hero-preview" className={`${heroSectionShell} ${heroPreviewSnapSectionClass} lg:hidden`}>
        <div className="hero-mobile-preview-panel flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center gap-4">
          <HeroDualPreview />
          <div className="w-full max-w-[22rem] shrink-0 px-0 sm:max-w-[24rem]">
            <PortalCta href="/#how-it-works" variant="ghost" size="lg" className="w-full justify-center gap-0">
              <PlayIcon />
              {hero.secondaryCta}
            </PortalCta>
          </div>
        </div>
      </section>

      {/* Desktop: single combined hero */}
      <section id="hero" className={`${heroSectionShell} ${heroSnapSectionClass} hidden lg:flex`}>
        <HeroBubbleGrid className="opacity-60" />
        <div className="hero-snap-inner relative flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center">
          <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,44%)_minmax(0,56%)] xl:gap-14 2xl:grid-cols-[minmax(0,42%)_minmax(0,58%)]">
            <div className="flex min-h-0 flex-col justify-center">
              <HeroCopy variant="desktop" />
            </div>
            <div className="relative flex w-full min-w-0 max-w-full flex-col items-end justify-center overflow-visible pl-2 xl:pl-8">
              <HeroDualPreview />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
