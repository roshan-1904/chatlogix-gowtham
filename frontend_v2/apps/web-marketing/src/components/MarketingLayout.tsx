import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useSnapScrollAnchors } from '../hooks/useSnapScrollAnchors';
import { SNAP_SCROLL_CONTAINER_CLASS } from '../lib/snapScroll';
import { MarketingFooter } from './MarketingFooter';
import { MarketingHeader } from './MarketingHeader';
import { StickyCta } from './StickyCta';

interface MarketingLayoutProps {
  children: ReactNode;
  /** One full-viewport section per scroll on the homepage. */
  snapScroll?: boolean;
}

export function MarketingLayout({ children, snapScroll = false }: MarketingLayoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useSnapScrollAnchors(scrollRef, snapScroll);

  useEffect(() => {
    if (!snapScroll) return undefined;

    document.documentElement.classList.add('marketing-snap-active');
    return () => {
      document.documentElement.classList.remove('marketing-snap-active');
    };
  }, [snapScroll]);

  if (snapScroll) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-white">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-lg focus:bg-primary-500 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <MarketingHeader pinned />
        <div ref={scrollRef} id="main-content" className={SNAP_SCROLL_CONTAINER_CLASS}>
          {children}
        </div>
        <StickyCta />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-lg focus:bg-primary-500 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <MarketingHeader />
      {/* Clearance for the fixed StickyCta lives on the footer, which is what it overlays. */}
      <main id="main-content">{children}</main>
      <MarketingFooter />
      <StickyCta />
    </div>
  );
}
