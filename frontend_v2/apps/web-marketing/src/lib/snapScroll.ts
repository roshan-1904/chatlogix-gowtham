/**
 * Full-height snap target below the marketing header (`--marketing-header-h`).
 *
 * At `lg+` (and tall enough) this is a fixed one-viewport height, which is the designed
 * look. Below `lg` it is a **minimum** height instead: a section whose content does not
 * fit grows and scrolls `#main-content`, rather than clipping the overflow or hiding it
 * behind a nested scroller. Nested scrollers are what fight `snap-mandatory` on iOS
 * Safari and Chrome Android, so the mobile layout must never create one.
 *
 * `index.css` applies the same `height: auto` release via `.marketing-snap-section` on
 * short laptops (`max-height: 860px`) and across the whole `lg`–`xl` width band
 * (1024–1279) at any height, where the grids are narrow enough to outgrow even a tall
 * viewport. It drops the container to `snap-proximity` in both bands, so `lg:snap-always`
 * below only ever applies where a section really is one viewport tall.
 */
export const SNAP_SECTION_HEIGHT = [
  'max-lg:h-auto max-lg:min-h-[calc(100dvh-var(--marketing-header-h))]',
  'lg:h-[calc(100dvh-var(--marketing-header-h))]',
].join(' ');

/**
 * Snap-stop behaviour. `snap-always` is kept only at `lg+`, where every section is
 * proven to fit one viewport. Below `lg` sections may exceed the viewport, and forcing
 * a stop mid-section would strand the part the user is still reading.
 */
const SNAP_SECTION_BASE = 'marketing-snap-section box-border shrink-0 snap-start lg:snap-always';

export const snapSectionClass = [
  SNAP_SECTION_BASE,
  SNAP_SECTION_HEIGHT,
  'flex min-w-0 flex-col justify-center overflow-hidden',
  'py-5 sm:py-6 lg:py-8',
].join(' ');

export const SNAP_SCROLL_CONTAINER_CLASS = [
  'marketing-snap-scroll',
  'min-h-0 flex-1 snap-y snap-proximity lg:snap-mandatory',
  'overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-smooth',
].join(' ');

/** Hero section snap — one viewport, no internal scroll. */
export const heroSnapSectionClass = [
  SNAP_SECTION_BASE,
  SNAP_SECTION_HEIGHT,
  'marketing-cta-safe-area',
  'flex min-w-0 flex-col justify-center overflow-hidden',
  'py-4 sm:py-5 lg:py-6 xl:py-8',
].join(' ');

/** Mobile-only second hero snap: before/after phone demos. */
export const heroPreviewSnapSectionClass = [
  SNAP_SECTION_BASE,
  SNAP_SECTION_HEIGHT,
  'marketing-cta-safe-area',
  'flex min-w-0 flex-col justify-center overflow-hidden',
  'py-4 sm:py-5',
].join(' ');

/** Stacked mobile/tablet: shorter phones so copy + preview fit one viewport. Desktop: scale by breakpoint. */
export const heroPhoneHeightClass = [
  'hero-phone-figure',
  'h-[min(11rem,calc((100dvh-var(--marketing-header-h)-var(--marketing-sticky-cta-h))*0.32))]',
  'max-h-[min(11rem,calc((100dvh-var(--marketing-header-h)-var(--marketing-sticky-cta-h))*0.32))]',
  'sm:h-[min(12.5rem,calc((100dvh-var(--marketing-header-h)-var(--marketing-sticky-cta-h))*0.36))]',
  'sm:max-h-[min(12.5rem,calc((100dvh-var(--marketing-header-h)-var(--marketing-sticky-cta-h))*0.36))]',
  'md:h-[min(14rem,calc((100dvh-var(--marketing-header-h)-var(--marketing-sticky-cta-h))*0.40))]',
  'md:max-h-[min(14rem,calc((100dvh-var(--marketing-header-h)-var(--marketing-sticky-cta-h))*0.40))]',
  'lg:h-[calc((100dvh-var(--marketing-header-h))*0.56)]',
  'lg:max-h-[calc((100dvh-var(--marketing-header-h))*0.56)]',
  'xl:h-[calc((100dvh-var(--marketing-header-h))*0.64)]',
  'xl:max-h-[calc((100dvh-var(--marketing-header-h))*0.64)]',
  '2xl:h-[calc((100dvh-var(--marketing-header-h))*0.72)]',
  '2xl:max-h-[calc((100dvh-var(--marketing-header-h))*0.72)]',
].join(' ');

/** Width from height × 320:520 on desktop; fill grid cell on mobile. */
export const heroPhoneWidthClass = [
  'w-full max-w-full',
  'lg:mx-0 lg:w-[calc((100dvh-var(--marketing-header-h))*0.56*320/520)]',
  'lg:max-w-[min(100%,calc((100dvh-var(--marketing-header-h))*0.56*320/520))]',
  'xl:w-[calc((100dvh-var(--marketing-header-h))*0.64*320/520)]',
  'xl:max-w-[min(100%,calc((100dvh-var(--marketing-header-h))*0.64*320/520))]',
  '2xl:w-[calc((100dvh-var(--marketing-header-h))*0.72*320/520)]',
  '2xl:max-w-[min(100%,calc((100dvh-var(--marketing-header-h))*0.72*320/520))]',
  'shrink-0',
].join(' ');
