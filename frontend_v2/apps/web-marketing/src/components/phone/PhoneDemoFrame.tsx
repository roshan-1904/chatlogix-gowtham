import type { ReactNode } from 'react';

/**
 * Intrinsic layout size every phone demo is authored at, in CSS px. Matches the
 * `320/520` aspect `WhatsAppPhoneShell` has always declared.
 */
export const PHONE_DEMO_WIDTH = 320;
export const PHONE_DEMO_HEIGHT = 520;

/**
 * Renders a phone demo at a fixed 320x520 box and scales the whole frame to fit its
 * slot, so the chat bubbles, chrome and timestamps keep identical proportions in every
 * section and at every breakpoint — only the frame's overall size changes.
 *
 * Sizing comes from `--phone-demo-w`, the **unitless** rendered width in px. The slot
 * derives its layout box from it (a `transform`ed element keeps its unscaled box, so the
 * box has to be stated explicitly) and the stage derives `scale()` from the same number,
 * which is what keeps the two in step. See `.phone-demo-slot` in `index.css`.
 *
 * Set it per usage, e.g. `className="[--phone-demo-w:260] lg:[--phone-demo-w:300]"`.
 */
export function PhoneDemoFrame({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={`phone-demo-slot ${className}`}>
      <div className="phone-demo-stage" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
