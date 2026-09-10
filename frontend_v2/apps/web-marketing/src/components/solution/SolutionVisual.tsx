import type { ReactNode } from 'react';
import { solution } from '../../copy';
import { CartOrderIcon } from '../hero/HeroIcons';
import { HandDrawnUnderline } from './HandDrawnUnderline';
import { SolutionPhoneDemo } from './SolutionPhoneDemo';

const NOTE_CLASS =
  'font-handwritten font-bold leading-[1.12] text-[#072349]/80 text-[1.05rem] sm:text-[1.2rem] lg:text-[1.45rem] xl:text-[1.65rem]';

/**
 * One handwriting gutter beside the phone at `xl+`. 10.25rem is reserved as padding on
 * the visual root and `9.75rem + 0.5rem` fills it exactly, so the absolutely-positioned
 * notes can never paint on the copy column or past the viewport. The widest note line
 * ("Helps turn chats") measures ~154px at `xl`, so 9.75rem holds every note on its
 * intended two lines. At 1440 this leaves the phone at its designed 23.5rem.
 */
const NOTE_GUTTER_PX = 'xl:px-[10.25rem]';
const NOTE_WIDTH = 'xl:w-[9.75rem]';
const NOTE_OFFSET_LEFT = 'xl:right-[calc(100%+0.5rem)]';
const NOTE_OFFSET_RIGHT = 'xl:left-[calc(100%+0.5rem)]';

function IconChip({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#e7f6f1] text-[#128C7E]">
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
      className="pointer-events-none absolute left-[68%] top-3 h-[4.25rem] w-[4.5rem] overflow-visible text-[#128C7E]"
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
      className="pointer-events-none absolute left-[66%] top-6 h-[3.75rem] w-[4.75rem] overflow-visible text-[#128C7E]"
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
      className="pointer-events-none absolute right-[68%] top-6 h-[4.25rem] w-[4.5rem] overflow-visible text-[#128C7E]"
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
    // The horizontal padding reserves a handwriting gutter on each side of the phone.
    // The flanking notes are positioned against the phone and sized to that gutter, so
    // they stay inside this column instead of painting on the copy or off the right edge.
    <div className={`relative mx-auto w-full min-w-0 ${NOTE_GUTTER_PX}`}>
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

      <div className="relative mx-auto w-[min(100%,13.25rem)] sm:w-[min(100%,15.5rem)] lg:w-[min(100%,21rem)] xl:w-[min(100%,23.5rem)]">
        <SolutionPhoneDemo />

        {/*
          Below `xl` there is no room beside the phone for handwriting, and the three
          flanking notes repeat what the benefit list already says, so they only render
          from `xl` up. The "Happy customers. More orders." payoff has no bullet
          equivalent, so it stays at every width — in normal flow under the phone.
        */}
        <div
          data-solution-note="instant"
          className={`pointer-events-none absolute top-[5%] hidden rotate-[-3deg] xl:block ${NOTE_OFFSET_LEFT} ${NOTE_WIDTH}`}
        >
          <p className={NOTE_CLASS}>
            {callouts.instantLine1}
            <br />
            {callouts.instantLine2}
          </p>
          <ArrowInstant />
        </div>

        <div
          data-solution-note="orders"
          className={`pointer-events-none absolute top-[52%] hidden rotate-[-2deg] xl:block ${NOTE_OFFSET_LEFT} ${NOTE_WIDTH}`}
        >
          <IconChip>
            <CartOrderIcon className="h-[26px] w-[26px]" />
          </IconChip>
          <p className={NOTE_CLASS}>
            {callouts.ordersLine1}
            <br />
            {callouts.ordersLine2}
          </p>
          <ArrowOrders />
        </div>

        <div
          data-solution-note="stock"
          className={`pointer-events-none absolute top-[7%] hidden flex-col items-end rotate-[4deg] text-right xl:flex ${NOTE_OFFSET_RIGHT} ${NOTE_WIDTH}`}
        >
          <IconChip>
            <CubeIcon className="h-[26px] w-[26px]" />
          </IconChip>
          <p className={NOTE_CLASS}>
            {callouts.stockLine1}
            <br />
            {callouts.stockLine2}
          </p>
          <ArrowStock />
        </div>

        <div
          data-solution-note="result"
          className="pointer-events-none mt-3 w-[10.5rem] rotate-[-3deg] sm:mt-4 sm:w-[12.5rem] lg:ml-auto lg:w-[14.5rem]"
        >
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
