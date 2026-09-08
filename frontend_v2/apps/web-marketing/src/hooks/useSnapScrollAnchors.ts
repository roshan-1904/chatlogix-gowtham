import { useEffect, type RefObject } from 'react';

function scrollToHash(container: HTMLElement, hash: string, behavior: ScrollBehavior = 'smooth') {
  if (!hash || hash === '#') return;
  const target = container.querySelector(hash);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior, block: 'start' });
  }
}

export function useSnapScrollAnchors(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (window.location.hash) {
      scrollToHash(container, window.location.hash, reducedMotion ? 'auto' : 'smooth');
    }

    const onDocumentClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a[href*="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const url = new URL(anchor.href, window.location.href);
      const onSamePage =
        url.pathname === window.location.pathname && url.hash.length > 1;

      if (!onSamePage) return;

      event.preventDefault();
      scrollToHash(container, url.hash, reducedMotion ? 'auto' : 'smooth');
      window.history.pushState(null, '', `${url.pathname}${url.hash}${url.search}`);
    };

    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [containerRef, enabled]);
}
