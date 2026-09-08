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
          viewport ? 'flex min-h-0 w-full flex-1 flex-col justify-center' : ''
        } ${innerClassName}`}
      >
        {children}
      </div>
      {footer}
    </section>
  );
}
