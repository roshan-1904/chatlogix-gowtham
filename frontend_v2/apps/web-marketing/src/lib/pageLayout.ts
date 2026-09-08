/** Full-bleed horizontal padding — no max-width container. */
export const pagePaddingX = 'px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-24';

export const pageInnerClass = `w-full ${pagePaddingX}`;

/** Hero + section headlines — letter/word spacing (see `.section-title` in index.css). */
export const sectionTitleClass = 'section-title';

/** Shared type scale for Hero, Problem, Solution, and How it Works. */
export const sectionEyebrowClass =
  'text-[10px] font-semibold uppercase tracking-[0.18em] text-[#128C7E] sm:text-[11px] sm:tracking-[0.2em]';

export const sectionHeadingClass = `${sectionTitleClass} font-display text-[1.45rem] font-extrabold leading-[1.1] text-primary-500 sm:text-3xl md:text-4xl lg:text-[2.65rem] lg:leading-[1.08] xl:text-[3.1rem]`;

export const sectionBodyClass =
  'text-[13px] leading-6 text-slate-600 sm:text-sm sm:leading-7 md:text-[16px]';

/** Handwritten annotations — same size as hero before/after callouts. */
export const handwrittenCalloutClass =
  'font-handwritten text-[1.15rem] font-bold leading-[1.18] lg:text-[1.65rem] xl:text-[1.85rem]';
