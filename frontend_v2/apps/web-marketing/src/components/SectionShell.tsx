import type { ReactNode } from 'react';
import { pageInnerClass } from '../lib/pageLayout';
import { snapSectionClass } from '../lib/snapScroll';

interface SectionShellProps {
  id?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
  /** Fit section content within one viewport (below sticky header). */
  viewport?: boolean;
  /** Full-bleed slot pinned to the bottom of the section (e.g. site footer). */
  footer?: ReactNode;
}

export function SectionShell({
  id,
  className = '',
  innerClassName = '',
  children,
  viewport = false,
  footer,
}: SectionShellProps) {
  return (
    <section
      id={id}
      className={`scroll-mt-0 ${viewport ? snapSectionClass : 'py-16 sm:py-20 lg:py-24'} ${
        footer ? '!justify-start !pb-0' : ''
      } ${className}`}
    >
      <div
        className={`${pageInnerClass} ${
          viewport
            ? // Below `lg` the inner is auto-height so the section grows with its content
              // instead of the inner becoming a nested scroller. `lg+` keeps the fixed
              // one-viewport box the design relies on.
              `marketing-section-inner flex w-full min-w-0 flex-col justify-center lg:min-h-0 lg:flex-1 ${
                footer ? '' : 'marketing-cta-safe-area'
              }`
            : ''
        } ${innerClassName}`}
      >
        {children}
      </div>
      {footer}
    </section>
  );
}
