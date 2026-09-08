/** Full-height snap target below the marketing header (`--marketing-header-h`). */
export const SNAP_SECTION_HEIGHT =
  'h-[calc(100dvh-var(--marketing-header-h))] max-lg:h-[calc(100dvh-var(--marketing-header-h)-env(safe-area-inset-bottom)-4.5rem)]';

export const snapSectionClass = [
  SNAP_SECTION_HEIGHT,
  'box-border shrink-0 snap-start snap-always',
  'flex flex-col justify-center overflow-hidden',
  'py-5 sm:py-6 lg:py-8',
].join(' ');

export const SNAP_SCROLL_CONTAINER_CLASS = [
  'marketing-snap-scroll',
  'min-h-0 flex-1 snap-y snap-mandatory',
  'overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-smooth',
].join(' ');

/** Hero section snap — one viewport, no internal scroll. */
export const heroSnapSectionClass = [
  SNAP_SECTION_HEIGHT,
  'box-border shrink-0 snap-start snap-always',
  'flex flex-col justify-center overflow-hidden',
  'py-4 sm:py-5 lg:py-6 xl:py-8',
].join(' ');

/** Mobile-only second hero snap: before/after phone demos. */
export const heroPreviewSnapSectionClass = [
  SNAP_SECTION_HEIGHT,
  'box-border shrink-0 snap-start snap-always',
  'flex flex-col justify-center overflow-hidden',
  'py-4 sm:py-5',
].join(' ');

/** Stacked mobile/tablet: shorter phones so copy + preview fit one viewport. Desktop: scale by breakpoint. */
export const heroPhoneHeightClass = [
  'hero-phone-figure',
  'h-[min(11rem,calc((100dvh-var(--marketing-header-h)-env(safe-area-inset-bottom)-4.5rem)*0.32))]',
  'max-h-[min(11rem,calc((100dvh-var(--marketing-header-h)-env(safe-area-inset-bottom)-4.5rem)*0.32))]',
  'sm:h-[min(12.5rem,calc((100dvh-var(--marketing-header-h)-env(safe-area-inset-bottom)-4.5rem)*0.36))]',
  'sm:max-h-[min(12.5rem,calc((100dvh-var(--marketing-header-h)-env(safe-area-inset-bottom)-4.5rem)*0.36))]',
  'md:h-[min(14rem,calc((100dvh-var(--marketing-header-h)-env(safe-area-inset-bottom)-4.5rem)*0.40))]',
  'md:max-h-[min(14rem,calc((100dvh-var(--marketing-header-h)-env(safe-area-inset-bottom)-4.5rem)*0.40))]',
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
