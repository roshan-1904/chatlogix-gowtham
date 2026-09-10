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
 * viewport. It also turns the container's snap **off** in those bands, because every snap
 * point is a section top and a released section can be taller than the scroller — so the
 * `snap-y` / `lg:snap-mandatory` and `lg:snap-always` below only ever take effect where a
 * section really is one viewport tall.
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
