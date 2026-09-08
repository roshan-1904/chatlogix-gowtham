import { problem } from '../../copy';
import { handwrittenCalloutClass } from '../../lib/pageLayout';

export function ProblemBusyDayCallout({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? 'relative w-fit max-w-[9.5rem] rotate-[-2deg] sm:max-w-none'
          : 'relative w-fit max-w-full rotate-[-3deg]'
      }
      aria-hidden
    >
      <p
        className={`${handwrittenCalloutClass} text-[#072349]/80 ${
          compact ? '!text-[0.95rem] leading-tight sm:!text-[1.05rem] lg:!text-[1.65rem]' : ''
        }`}
      >
        {problem.calloutLine1}
        <br />
        <span className="relative inline-block pb-[0.55em]">
          {problem.calloutLine2}
          <svg
            className="absolute left-0 top-[1.05em] h-[0.7em] w-full overflow-visible text-[#128C7E]"
            viewBox="0 0 100 14"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M3 4C35 -1 64 14 97 9.5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M4 10C35 -1 64 20 97 13.5"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </p>

      {!compact ? (
        <svg
          className="pointer-events-none absolute right-full top-1 hidden h-[16rem] w-[13rem] overflow-visible text-[#072349]/50 lg:block"
          viewBox="0 0 160 210"
          fill="none"
          aria-hidden
        >
          <path
            d="M148 38C108 10 42 6 22 52C6 80 18 142 15 138"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <g transform="rotate(-15 15 138)">
            <path
              d="M15 138L5 126M15 138L27 128"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      ) : null}
    </div>
  );
}
