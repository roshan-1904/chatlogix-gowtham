import { heroPreviewAfter, heroPreviewBefore } from '../../../copy';

const POPUP_COPY = {
  problem: {
    emoji: '😩',
    headline: heroPreviewBefore.statPopup.headline,
    body: heroPreviewBefore.statPopup.body,
    cardClass: 'border-gray-200/90 bg-white',
    headlineClass: 'text-[#072349]',
    bodyClass: 'text-[#072349]/75',
  },
  solution: {
    emoji: '😊',
    headline: heroPreviewAfter.statPopup.headline,
    body: heroPreviewAfter.statPopup.body,
    cardClass: 'border-[#25D366]/35 bg-[#f0fdf4]',
    headlineClass: 'text-[#008069]',
    bodyClass: 'text-[#008069]/80',
  },
} as const;

export function HeroDemoStatPopup({ variant }: { variant: keyof typeof POPUP_COPY }) {
  const { emoji, headline, body, cardClass, headlineClass, bodyClass } = POPUP_COPY[variant];

  return (
    <div
      className="hero-demo-stat-overlay absolute inset-0 z-30 flex items-center justify-center bg-[#072349]/45 px-[7%] backdrop-blur-[1px] motion-safe:animate-[fadeSlideIn_0.35s_ease-out]"
      role="status"
      aria-live="polite"
      aria-label={`${headline}. ${body}`}
    >
      <div
        className={`hero-demo-stat-card rounded-2xl border shadow-[0_8px_24px_rgba(7,35,73,0.18)] ${cardClass}`}
      >
        <span className="hero-demo-stat-emoji" aria-hidden>
          {emoji}
        </span>
        <p className={`hero-demo-stat-headline ${headlineClass}`}>{headline}</p>
        <p className={`hero-demo-stat-body ${bodyClass}`}>{body}</p>
      </div>
    </div>
  );
}
