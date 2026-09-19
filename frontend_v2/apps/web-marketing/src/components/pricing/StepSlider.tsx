import { useId } from 'react';

interface StepSliderProps {
  label: string;
  /** Small helper under the label. Wired to `aria-describedby`. */
  helper?: string;
  /** Ordered tick values. The slider carries the *index*, never the value itself. */
  values: readonly number[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Big value shown beside the label. */
  formatValue: (value: number) => string;
  /** Spoken value — `aria-valuetext`, so a reader never announces the bare index. */
  formatValueText: (value: number) => string;
  /** Short label under each tick. Defaults to the compact number. */
  formatTick?: (value: number) => string;
}

/**
 * Native `input[type=range]` stepping over an index into `values`, so the ticks stay at
 * the exact figures the estimate is quoted for instead of a free-form range.
 *
 * The track is a sibling div rather than `::-webkit-slider-runnable-track`, because the
 * webkit track cannot hold a separate fill element and a gradient background would have
 * to be recomputed in two vendor pseudo-elements. The input keeps a transparent track at
 * the full 44px hit height and only paints its thumb.
 */
export function StepSlider({
  label,
  helper,
  values,
  index,
  onIndexChange,
  formatValue,
  formatValueText,
  formatTick,
}: StepSliderProps) {
  const inputId = useId();
  const helperId = useId();
  const lastIndex = values.length - 1;
  const value = values[index];
  const progress = lastIndex > 0 ? (index / lastIndex) * 100 : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={inputId} className="text-[12px] font-semibold text-primary-500 sm:text-[13px]">
            {label}
          </label>
          {helper ? (
            <p id={helperId} className="mt-0.5 text-[10px] font-medium leading-4 text-slate-500 sm:text-[11px]">
              {helper}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-[#128C7E] sm:text-[14px]">
          {formatValue(value)}
        </span>
      </div>

      <div className="relative mt-1 h-11">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-[#128C7E]" style={{ width: `${progress}%` }} />
        </div>
        {/* Thumb geometry: the webkit thumb is laid out against the top of the track, so a
            44px track and a 20px thumb need exactly 12px of margin to centre. */}
        <input
          id={inputId}
          type="range"
          min={0}
          max={lastIndex}
          step={1}
          value={index}
          aria-valuetext={formatValueText(value)}
          aria-describedby={helper ? helperId : undefined}
          onChange={(event) => onIndexChange(Number(event.target.value))}
          className={[
            'relative h-11 w-full cursor-pointer appearance-none bg-transparent focus:outline-none',
            '[&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-webkit-slider-thumb]:mt-3 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#128C7E]',
            '[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(7,35,73,0.25)]',
            '[&:focus-visible::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(18,140,126,0.3)]',
            '[&::-moz-range-track]:h-11 [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-transparent',
            '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#128C7E] [&::-moz-range-thumb]:bg-white',
            '[&:focus-visible::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(18,140,126,0.3)]',
          ].join(' ')}
        />
      </div>

      <div className="mt-0.5 flex justify-between text-[9.5px] font-medium tabular-nums text-slate-400 sm:text-[10.5px]">
        {values.map((tick, tickIndex) => (
          <span
            key={tick}
            aria-hidden
            className={tickIndex === index ? 'font-bold text-[#128C7E]' : undefined}
          >
            {(formatTick ?? String)(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}
