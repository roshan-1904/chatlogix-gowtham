import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useLogout } from '@chatlogix/auth';
import { Badge, BrandLogo, Button } from '@chatlogix/ui';
import { formatTrialLeft, fetchTrialWallet, ONBOARDING_STEP_LABELS } from '../../lib/onboarding';
import { NeedHelpFooter } from './NeedHelpFooter';
import { OnboardingGuidePanel, type OnboardingGuideCopy } from './OnboardingGuidePanel';
import { onboardingCopy } from './onboardingCopy';

const ONBOARDING_STEPS = [
  { id: 1, label: ONBOARDING_STEP_LABELS[0], href: '/onboarding/catalog' },
  { id: 2, label: ONBOARDING_STEP_LABELS[1], href: '/onboarding/clarify' },
  { id: 3, label: ONBOARDING_STEP_LABELS[2], href: '/onboarding/confirm' },
  { id: 4, label: ONBOARDING_STEP_LABELS[3], href: '/onboarding/demo-chat' },
  { id: 5, label: ONBOARDING_STEP_LABELS[4], href: '/onboarding/review' },
] as const;

function StepCheck() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The right column repeats the left H1 on some steps; only show it when it adds something. */
function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface OnboardingLayoutProps {
  step: number;
  children: ReactNode;
  guide?: OnboardingGuideCopy;
  guideVisual?: ReactNode;
  allComplete?: boolean;
  hideWallet?: boolean;
  hideStepper?: boolean;
  /** Force-drop the right-column h2 even when it differs from the guide H1. */
  hideActionTitle?: boolean;
  /** Catalog review: 50/50 instead of 60/40 so product cards have room */
  splitEven?: boolean;
  /** Demo chat: minimal chrome, compact help footer, hide mobile guide */
  demoMode?: boolean;
}

export function OnboardingLayout({
  step,
  children,
  guide,
  guideVisual,
  allComplete = false,
  hideWallet = false,
  hideStepper = false,
  hideActionTitle = false,
  splitEven = false,
  demoMode = false,
}: OnboardingLayoutProps) {
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: wallet, isLoading } = useQuery({
    queryKey: ['trial-wallet'],
    queryFn: fetchTrialWallet,
    staleTime: 30_000,
    enabled: !hideWallet,
  });

  const rootRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    void logout().then(() => {
      void navigate('/login');
    });
  };

  useEffect(() => {
    if (!demoMode) return;
    const el = rootRef.current;
    const vv = window.visualViewport;
    if (!el) return;

    const sync = () => {
      const height = vv?.height ?? window.innerHeight;
      el.style.height = `${height}px`;
      el.style.maxHeight = `${height}px`;
    };

    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      el.style.height = '';
      el.style.maxHeight = '';
    };
  }, [demoMode]);

  const actionTitle = guide?.actionTitle?.trim() ?? '';
  const showActionTitle =
    !hideActionTitle &&
    actionTitle.length > 0 &&
    normalizeTitle(actionTitle) !== normalizeTitle(guide?.h1 ?? '');

  const guideWidth = splitEven ? 'lg:w-1/2' : 'lg:w-1/2 xl:w-[60%]';
  const actionWidth = splitEven ? 'lg:w-1/2' : 'lg:w-1/2 xl:w-[40%]';

  return (
    <div
      ref={rootRef}
      className={`flex flex-col bg-white ${
        guide || demoMode ? 'h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      <header className="shrink-0 border-b border-gray-200">
        <div
          className={`mx-auto flex w-full items-center justify-between gap-4 ${
            demoMode ? 'px-3 py-2 md:px-4 md:py-4 lg:px-8' : 'px-4 py-4 lg:px-8'
          }`}
        >
          <Link to="/onboarding/catalog" className="flex shrink-0 items-center">
            <BrandLogo className="h-8 w-auto" />
          </Link>

          {!hideStepper && (
            <nav className="hidden min-w-0 flex-1 justify-center md:flex" aria-label="Setup steps">
              <ol className="flex items-center">
                {ONBOARDING_STEPS.map((item, i) => {
                  const done = allComplete || item.id < step;
                  const active = !allComplete && item.id === step;
                  const canLink = done || active;
                  const content = (
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          active
                            ? 'bg-primary-500 text-white'
                            : done
                              ? 'border border-primary-500 bg-white text-primary-500'
                              : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {done ? <StepCheck /> : item.id}
                      </span>
                      <span
                        className={`hidden text-sm lg:inline ${
                          active
                            ? 'font-semibold text-primary-500'
                            : done
                              ? 'text-gray-700'
                              : 'text-gray-400'
                        }`}
                      >
                        {item.label}
                      </span>
                    </span>
                  );
                  return (
                    <li
                      key={item.id}
                      className="flex items-center"
                      aria-current={active ? 'step' : undefined}
                    >
                      {i > 0 && (
                        <span
                          aria-hidden
                          className={`mx-2 h-px w-4 lg:w-6 ${done ? 'bg-primary-500' : 'bg-gray-200'}`}
                        />
                      )}
                      {canLink ? (
                        <Link to={item.href} className="rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          <div className="flex shrink-0 items-center gap-3">
            {!hideWallet && (
              <Badge variant="info" className="rounded-full px-2.5 py-1">
                {isLoading ? '…' : formatTrialLeft(wallet?.balanceMilli ?? 0)}
              </Badge>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={handleLogout}>
              {onboardingCopy.help.logout}
            </Button>
          </div>
        </div>
        {!hideStepper && (
          <div className="px-4 pb-3 md:hidden">
            <p className="mb-2 text-xs text-gray-500">
              {allComplete ? 'Submitted' : `Step ${step} of 5 · ${ONBOARDING_STEPS[step - 1]?.label}`}
            </p>
            <div className="flex gap-1">
              {ONBOARDING_STEPS.map((item) => (
                <div
                  key={item.id}
                  className={`h-1 flex-1 rounded-full ${
                    allComplete || item.id <= step ? 'bg-primary-500' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </header>

      {guide ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <aside
            className={`hidden min-h-0 overflow-y-auto border-r border-gray-200 bg-gray-50 px-10 py-12 xl:px-16 lg:flex lg:flex-col lg:justify-center ${guideWidth}`}
          >
            <OnboardingGuidePanel copy={guide} visual={guideVisual} />
          </aside>

          <section
            className={`flex min-h-0 flex-1 flex-col bg-white ${actionWidth} ${
              demoMode ? 'overflow-hidden' : 'overflow-y-auto'
            }`}
          >
            {!demoMode && (
              <div className="px-5 pb-1 pt-6 sm:px-10 lg:hidden">
                <OnboardingGuidePanel copy={guide} compact />
              </div>
            )}
            <div
              className={
                demoMode
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-0 py-0 lg:overflow-y-auto lg:px-6 lg:py-6 xl:px-10'
                  : 'flex-1 px-5 py-8 sm:px-10 lg:px-12 lg:py-10'
              }
            >
              <div
                className={
                  demoMode
                    ? 'flex min-h-0 flex-1 flex-col'
                    : `mx-auto w-full ${splitEven ? 'max-w-xl' : 'max-w-md'}`
                }
              >
                {!demoMode && showActionTitle && (
                  <h2 className="mb-5 hidden text-xl font-semibold leading-snug tracking-tight text-gray-900 lg:block">
                    {guide.actionTitle}
                  </h2>
                )}
                {children}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">{children}</main>
      )}

      {/* Help stays reachable on every step, including the demo chat, where it
          shrinks to a single tight line so the full-height phone keeps its room. */}
      <div className="shrink-0">
        <NeedHelpFooter className={demoMode ? 'px-3 py-1.5 text-xs' : undefined} />
      </div>
    </div>
  );
}
