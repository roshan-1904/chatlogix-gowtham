import { useEffect, type RefObject } from 'react';

/** How long after mount we keep correcting the initial hash landing. */
const SETTLE_WINDOW_MS = 2500;
/** Consecutive still frames that mean scrolling has come to rest. */
const FRAMES_AT_REST = 3;

/**
 * A hash is not always a valid selector — `#2fast` throws in `querySelector` — and these
 * come straight from the URL bar, so treat a malformed one as "no target".
 */
function findTarget(container: HTMLElement, hash: string): HTMLElement | null {
  if (!hash || hash === '#') return null;
  try {
    const target = container.querySelector(hash);
    return target instanceof HTMLElement ? target : null;
  } catch {
    return null;
  }
}

function scrollToHash(container: HTMLElement, hash: string, behavior: ScrollBehavior = 'smooth') {
  findTarget(container, hash)?.scrollIntoView({ behavior, block: 'start' });
}

/** Offset of `hash`'s section from the top of the scroller, or null if it is gone. */
function driftFromTop(container: HTMLElement, hash: string): number | null {
  const target = findTarget(container, hash);
  if (!target) return null;
  return target.getBoundingClientRect().top - container.getBoundingClientRect().top;
}

function scrollByWithoutAnimating(container: HTMLElement, delta: number) {
  const previous = container.style.scrollBehavior;
  container.style.scrollBehavior = 'auto';
  container.scrollTop += delta;
  container.style.scrollBehavior = previous;
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
    const teardown: Array<() => void> = [];

    const initialHash = window.location.hash;
    if (initialHash) {
      scrollToHash(container, initialHash, reducedMotion ? 'auto' : 'smooth');

      // Layout keeps settling after mount: web fonts reflow every heading, and below `lg`
      // sections are auto-height so they grow as that happens. The mount-time scroll
      // therefore lands short of the target — measured up to 114px at 768x1024, which
      // leaves the tail of the previous section on screen. Wait for scrolling to come to
      // rest, then correct whatever drift layout introduced, until the settle window
      // closes. Bail out on real user input so we never fight the reader's own gesture.
      let stopped = false;
      let lastScrollTop = -1;
      let framesAtRest = 0;
      let frame = 0;
      const deadline = performance.now() + SETTLE_WINDOW_MS;

      const tick = () => {
        if (stopped) return;

        framesAtRest = container.scrollTop === lastScrollTop ? framesAtRest + 1 : 0;
        lastScrollTop = container.scrollTop;

        if (framesAtRest >= FRAMES_AT_REST) {
          const drift = driftFromTop(container, initialHash);
          if (drift === null) {
            stopped = true;
            return;
          }
          if (Math.abs(drift) > 1) {
            scrollByWithoutAnimating(container, drift);
            framesAtRest = 0;
          }
        }

        if (performance.now() < deadline) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);

      const stop = () => {
        stopped = true;
      };
      // `scroll` is not usable here: our own programmatic scrolling fires it too.
      const userIntentEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
      userIntentEvents.forEach((type) => window.addEventListener(type, stop, { passive: true }));

      teardown.push(() => {
        stopped = true;
        cancelAnimationFrame(frame);
        userIntentEvents.forEach((type) => window.removeEventListener(type, stop));
      });
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
    teardown.push(() => document.removeEventListener('click', onDocumentClick));

    return () => teardown.forEach((fn) => fn());
  }, [containerRef, enabled]);
}
