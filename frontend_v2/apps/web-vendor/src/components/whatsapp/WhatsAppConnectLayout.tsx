import type { ReactNode } from 'react';
import { WhatsAppConnectGuidePanel } from './WhatsAppConnectGuidePanel';

export type ConnectWizardUiStep = 'intro' | 'path' | 'connect' | 'status';

const STEPS: Array<{ id: ConnectWizardUiStep; label: string }> = [
  { id: 'intro', label: 'Get started' },
  { id: 'path', label: 'Your setup' },
  { id: 'connect', label: 'Connect' },
  { id: 'status', label: 'Status' },
];

function mapWizardToUi(step: 'intro' | 'path' | 'preflight' | 'connecting' | 'status'): ConnectWizardUiStep {
  if (step === 'preflight' || step === 'connecting') return 'connect';
  return step;
}

interface WhatsAppConnectLayoutProps {
  activeStep: 'intro' | 'path' | 'preflight' | 'connecting' | 'status';
  headline: string;
  description: string;
  children: ReactNode;
}

export function WhatsAppConnectLayout({
  activeStep,
  headline,
  description,
  children,
}: WhatsAppConnectLayoutProps) {
  const uiStep = mapWizardToUi(activeStep);
  const activeIndex = STEPS.findIndex((s) => s.id === uiStep);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-1 sm:p-2">
      <header>
        <h1 className="text-xl font-bold text-primary-500 sm:text-2xl">{headline}</h1>
        <p className="mt-1 text-xs text-gray-500 sm:text-sm">{description}</p>
      </header>

      <nav aria-label="Connect progress" className="overflow-x-auto">
        <ol className="flex min-w-[320px] items-center gap-2 sm:gap-3">
          {STEPS.map((step, index) => {
            const done = index < activeIndex;
            const current = index === activeIndex;
            return (
              <li key={step.id} className="flex flex-1 items-center gap-2">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    current
                      ? 'bg-primary-500 text-white'
                      : done
                        ? 'border-2 border-primary-500 text-primary-500'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {done ? (
                    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`hidden text-xs font-medium sm:inline ${
                    current ? 'text-primary-500' : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
                {index < STEPS.length - 1 && (
                  <span className={`hidden h-px flex-1 sm:block ${done ? 'bg-primary-500/40' : 'bg-gray-200'}`} />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">{children}</div>
        <div className="hidden lg:col-span-2 lg:block">
          <WhatsAppConnectGuidePanel />
        </div>
      </div>
    </div>
  );
}
