import { useState } from 'react';
import { onboardingCopy } from './onboardingCopy';

type FaqVariant = 'light' | 'dark';

interface SignupFaqProps {
  variant?: FaqVariant;
}

export function SignupFaq({ variant = 'light' }: SignupFaqProps) {
  const { h2, items } = onboardingCopy.signup.faq;
  const visibleItems = items.slice(0, 2);
  const accordionItems = items.slice(2);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const isDark = variant === 'dark';
  const cardClass = isDark
    ? 'rounded-lg border border-white/20 bg-white/5 overflow-hidden'
    : 'rounded-lg border border-gray-200 bg-white overflow-hidden';
  const questionClass = isDark ? 'text-sm font-medium text-white' : 'text-sm font-medium text-gray-900';
  const answerClass = isDark
    ? 'text-sm text-white/80 leading-relaxed'
    : 'text-sm text-gray-600 leading-relaxed';

  return (
    <div className={isDark ? 'mt-4' : 'mt-3'}>
      <h2 className={isDark ? 'text-base font-semibold text-white' : 'text-base font-semibold text-gray-900'}>
        {h2}
      </h2>
      <div className="mt-3 space-y-2">
        {visibleItems.map((item) => (
          <div key={item.question} className={cardClass}>
            <h3 className={`px-4 pt-3 ${questionClass}`}>{item.question}</h3>
            <p className={`px-4 pb-3 pt-1 ${answerClass}`}>{item.answer}</p>
          </div>
        ))}
        {accordionItems.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={item.question} className={cardClass}>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className={
                  isDark
                    ? 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5'
                    : 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50'
                }
                aria-expanded={isOpen}
              >
                <h3 className={questionClass}>{item.question}</h3>
                <svg
                  className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${
                    isDark ? 'text-white/70' : 'text-gray-500'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && <p className={`px-4 pb-3 ${answerClass}`}>{item.answer}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
