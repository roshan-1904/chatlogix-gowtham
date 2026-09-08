import { useState } from 'react';
import { onboardingCopy } from './onboardingCopy';

type FaqVariant = 'light' | 'dark';

interface SignupFaqProps {
  variant?: FaqVariant;
}

export function SignupFaq({ variant = 'dark' }: SignupFaqProps) {
  const { h2, items } = onboardingCopy.signup.faq;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const isDark = variant === 'dark';

  return (
    <div className={isDark ? 'mt-4' : 'mt-3'}>
      <h2 className="sr-only">{h2}</h2>
      <div className="space-y-2">
        {items.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={item.question}
              className={
                isDark
                  ? 'rounded-lg border border-white/20 bg-white/5 overflow-hidden'
                  : 'rounded-lg border border-gray-200 bg-white overflow-hidden'
              }
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className={
                  isDark
                    ? 'w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-white hover:bg-white/5'
                    : 'w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50'
                }
                aria-expanded={isOpen}
              >
                <h3 className="text-sm font-medium">{item.question}</h3>
                <svg
                  className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${isDark ? 'text-white/70' : 'text-gray-500'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <p
                  className={
                    isDark
                      ? 'px-4 pb-3 text-sm text-white/80 leading-relaxed'
                      : 'px-4 pb-3 text-sm text-gray-600 leading-relaxed'
                  }
                >
                  {item.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
