import type { ReactNode } from 'react';
import { solution } from '../../copy';
import { CartOrderIcon } from '../hero/HeroIcons';
import { HandDrawnUnderline } from './HandDrawnUnderline';
import { SolutionPhoneDemo } from './SolutionPhoneDemo';

const NOTE_CLASS =
  'font-handwritten font-bold leading-[1.12] text-[#072349]/80 text-[1.05rem] sm:text-[1.2rem] lg:text-[1.45rem] xl:text-[1.65rem]';

function IconChip({ children }: { children: ReactNode }) {
  return (
    <span className="mb-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#e7f6f1] text-[#128C7E] sm:mb-1 sm:h-8 sm:w-8 lg:h-9 lg:w-9">
      {children}
    </span>
  );
}

function CubeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3 21 8v8l-9 5-9-5V8l9-5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 13v8M12 13 3 8M12 13l9-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkMarks() {
  return (
    <svg
      className="absolute -top-2 left-[0.85em] h-3 w-8 text-[#128C7E] sm:-top-2.5 sm:h-3.5"
      viewBox="0 0 36 14"
      fill="none"
      aria-hidden
    >
      <path d="M4 10L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 11L18 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M24 10L29 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowInstant() {
  return (
    <svg
      className="pointer-events-none absolute left-[78%] top-4 h-14 w-[4.25rem] overflow-visible text-[#128C7E] sm:h-16 sm:w-20 lg:left-[82%] lg:h-[4.75rem] lg:w-[6.5rem]"
      viewBox="0 0 100 72"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 8C32 10 62 28 92 62"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <g transform="rotate(45 92 62)">
        <path
          d="M92 62L81 54M92 62L82 70"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

function ArrowOrders() {
  return (
    <svg
      className="pointer-events-none absolute left-[76%] top-8 h-12 w-[4.5rem] overflow-visible text-[#128C7E] sm:h-14 sm:w-[5.5rem] lg:left-[80%] lg:h-16 lg:w-[6.75rem]"
      viewBox="0 0 100 64"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 16C36 8 68 22 94 52"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <g transform="rotate(45 94 52)">
        <path
          d="M94 52L83 44M94 52L84 58"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

function ArrowStock() {
  return (
    <svg
      className="pointer-events-none absolute right-[78%] top-7 h-14 w-[4.25rem] overflow-visible text-[#128C7E] sm:h-16 sm:w-20 lg:right-[82%] lg:h-[4.75rem] lg:w-[6.5rem]"
      viewBox="0 0 100 72"
      fill="none"
      aria-hidden
    >
      <path
        d="M94 8C68 12 36 30 8 62"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <g transform="rotate(-45 8 62)">
        <path
          d="M8 62L19 54M8 62L20 68"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

export function SolutionVisual() {
  const { callouts } = solution;

  return (
    <div className="relative mx-auto w-full overflow-visible">
      <div
        className="pointer-events-none absolute left-[12%] top-[22%] h-36 w-36 rounded-full bg-[#d7f4ec]/90 blur-2xl sm:h-44 sm:w-44"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[8%] top-[14%] h-40 w-40 rounded-full bg-[#d7f4ec]/80 blur-2xl sm:h-48 sm:w-48"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[10%] left-1/2 h-32 w-48 -translate-x-1/2 rounded-full bg-[#e7f6f1]/90 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto w-[min(100%,13.25rem)] pb-16 sm:w-[min(100%,15.5rem)] sm:pb-[4.5rem] lg:w-[min(100%,21rem)] lg:pb-20 xl:w-[min(100%,23.5rem)]">
        <SolutionPhoneDemo />

        <div className="pointer-events-none absolute right-[calc(100%+0.7rem)] top-[5%] w-[7.75rem] rotate-[-3deg] sm:right-[calc(100%+1.1rem)] sm:w-[9.5rem] lg:right-[calc(100%+2.25rem)] lg:w-[11.5rem] xl:right-[calc(100%+2.75rem)]">
          <p className={NOTE_CLASS}>
            {callouts.instantLine1}
            <br />
            {callouts.instantLine2}
          </p>
          <ArrowInstant />
        </div>

        <div className="pointer-events-none absolute right-[calc(100%+0.7rem)] top-[50%] w-[10.25rem] rotate-[-2deg] sm:right-[calc(100%+1.1rem)] sm:w-[10rem] lg:right-[calc(100%+2.25rem)] lg:w-[12rem] xl:right-[calc(100%+2.75rem)]">
          <IconChip>
            <CartOrderIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-[28px] lg:w-[28px]" />
          </IconChip>
          <p className={NOTE_CLASS}>
            {callouts.ordersLine1}
            <br />
            {callouts.ordersLine2}
          </p>
          <ArrowOrders />
        </div>

        <div className="pointer-events-none absolute left-[calc(100%+0.7rem)] top-[7%] flex w-[12rem] flex-col items-end rotate-[4deg] text-right sm:left-[calc(100%+1.1rem)] sm:w-[12rem] lg:left-[calc(100%+2.25rem)] lg:w-[12rem] xl:left-[calc(100%+2.75rem)]">
          <IconChip>
            <CubeIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-[28px] lg:w-[28px]" />
          </IconChip>
          <p className={NOTE_CLASS}>
            {callouts.stockLine1}
            <br />
            {callouts.stockLine2}
          </p>
          <ArrowStock />
        </div>

        <div className="pointer-events-none absolute left-[58%] top-full mt-2 w-[10.5rem] rotate-[-3deg] sm:mt-3 sm:w-[12.5rem] lg:left-[62%] lg:mt-4 lg:w-[14.5rem]">
          <p className={`${NOTE_CLASS} relative`}>
            <span className="relative inline-block">
              <SparkMarks />
              {callouts.resultLine1}
            </span>
            <br />
            <span className="relative inline-block pb-[0.55em]">
              {callouts.resultLine2}
              <HandDrawnUnderline />
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
