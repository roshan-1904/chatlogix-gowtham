import { TryFreeCta } from './PortalCta';

export function StickyCta() {
  return (
    // Height is pinned to `--marketing-sticky-cta-h` so the value every section subtracts
    // and pads for cannot drift from what actually renders. See `index.css`.
    <div className="fixed inset-x-0 bottom-0 z-40 h-[var(--marketing-sticky-cta-h)] border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <TryFreeCta className="w-full" size="lg" />
    </div>
  );
}
