/**
 * Problem card preview layout.
 *
 * The annotations used to be an `inset-0` overlay, so pills were drawn straight over the
 * chat text at every width. They now sit in a real column beside the mini WhatsApp frame,
 * and the frame only gets the width the annotation column leaves — so the two cannot
 * overlap regardless of card width.
 */

/** Preview row: annotation column + mini frame. Height follows its content, never fixed. */
export const problemCardPreviewAreaClass = [
  'relative flex w-full min-w-0 items-center justify-center',
  'gap-1 sm:gap-1.5 xl:gap-2',
].join(' ');

/** Short-label pill column (rose card). Justification is set per card. */
export const problemPillColumnClass = [
  'flex shrink-0 flex-col items-start self-stretch py-1',
  'w-[4.5rem] sm:w-[5rem] xl:w-[5.5rem]',
].join(' ');

/** Sentence-length note column (amber / blue cards) — wider, wraps to 2-3 lines. */
export const problemNoteColumnClass = [
  'flex shrink-0 flex-col self-stretch py-1',
  'w-[5.25rem] sm:w-[5.75rem] xl:w-[6.5rem]',
].join(' ');

/**
 * Mini WhatsApp shell — fills whatever the annotation column leaves, capped so the frame
 * never grows past the width its 9-11px type was drawn for.
 */
export const problemPreviewShellClass = [
  'relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden',
  'max-w-[14rem]',
  'rounded-[14px] border border-slate-200 bg-white shadow-[0_6px_18px_rgba(11,20,26,0.1)] sm:rounded-[16px]',
].join(' ');
