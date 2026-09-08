import { TryFreeCta } from './PortalCta';

export function StickyCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <TryFreeCta className="w-full" size="lg" />
    </div>
  );
}
