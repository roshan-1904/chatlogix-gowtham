/** Card zone that wraps each mini WhatsApp preview — height tracks viewport. */
export const problemCardPreviewAreaClass = [
  'problem-card-preview-area',
  'relative flex shrink-0 items-center justify-center overflow-visible px-3 py-4 sm:px-4 sm:py-5',
].join(' ');

/** Mini WhatsApp shell inside problem cards — height/width from viewport (see index.css). */
export const problemPreviewShellClass = [
  'problem-preview-frame',
  'relative z-10 mx-auto flex shrink-0 flex-col overflow-hidden rounded-xl border border-[#e9edef] bg-white shadow-[0_4px_16px_rgba(11,20,26,0.1)]',
].join(' ');
