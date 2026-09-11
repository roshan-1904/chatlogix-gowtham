import { onboardingCopy } from './onboardingCopy';

/** Single grey block. Pulse is motion-safe so reduced-motion users get a static placeholder. */
function Block({ className = '' }: { readonly className?: string }) {
  return <div aria-hidden className={`motion-safe:animate-pulse bg-gray-100 ${className}`} />;
}

interface OnboardingActionSkeletonProps {
  /** Number of field-sized placeholder rows. */
  readonly rows?: number;
  /** Show a full-width button placeholder at the bottom. */
  readonly cta?: boolean;
  readonly className?: string;
}

/**
 * Placeholder for the right (action) column of OnboardingLayout, so a hydrating
 * step keeps the same shape as the loaded step instead of collapsing to "Loading…".
 */
export function OnboardingActionSkeleton({
  rows = 3,
  cta = true,
  className = '',
}: OnboardingActionSkeletonProps) {
  return (
    <div className={`space-y-4 ${className}`} role="status" aria-live="polite">
      <Block className="h-4 w-2/3 rounded" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2">
          <Block className="h-3 w-24 rounded" />
          <Block className="h-11 w-full rounded-lg" />
        </div>
      ))}
      {cta ? <Block className="h-11 w-full rounded-lg" /> : null}
      <span className="sr-only">{onboardingCopy.help.loading}</span>
    </div>
  );
}

/**
 * Whole-page placeholder matching the onboarding 60/40 split, for states that
 * render before OnboardingLayout can (auth resolution in ProtectedRoute).
 */
export function OnboardingPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-white" role="status" aria-live="polite">
      <header className="shrink-0 border-b border-gray-200">
        <div className="mx-auto flex w-full items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <Block className="h-8 w-32 rounded" />
          <Block className="hidden h-7 w-72 rounded-full md:block" />
          <Block className="h-7 w-24 rounded-full" />
        </div>
        <div className="flex gap-1 px-4 pb-3 md:hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <Block key={i} className="h-1 flex-1 rounded-full" />
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="hidden border-r border-gray-200 bg-gray-50 px-10 py-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-center xl:w-[60%] xl:px-16">
          <div className="mx-auto w-full max-w-2xl space-y-4">
            <Block className="h-3 w-20 rounded" />
            <Block className="h-9 w-4/5 rounded" />
            <Block className="h-4 w-3/5 rounded" />
            <Block className="mt-4 h-40 w-full rounded-xl" />
          </div>
        </aside>

        <section className="flex flex-1 flex-col bg-white lg:w-1/2 xl:w-[40%]">
          <div className="flex-1 px-5 py-8 sm:px-10 lg:px-12 lg:py-10">
            <div className="mx-auto w-full max-w-md space-y-4">
              <Block className="h-3 w-20 rounded lg:hidden" />
              <Block className="h-7 w-3/4 rounded lg:hidden" />
              <OnboardingActionSkeleton className="lg:pt-2" />
            </div>
          </div>
        </section>
      </div>

      <span className="sr-only">{onboardingCopy.help.loading}</span>
    </div>
  );
}
