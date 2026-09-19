import { useMemo, useState } from 'react';
import { SectionShell } from '../SectionShell';
import { PortalCta } from '../PortalCta';
import { IncludedStar } from '../pricing/IncludedStar';
import { StepSlider } from '../pricing/StepSlider';
import { TryCardIcon } from '../try/TryIcons';
import { pricingCalculator } from '../../copy';
import { site, TRIAL_GRANT_RUPEES } from '../../lib/site';
import { sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';
import {
  DAYS_PER_MONTH,
  estimateMonthlySpend,
  formatRatesEffective,
  nearestStepIndex,
  PRICING_CONFIG,
  PRICING_PRESETS,
  type PricingEstimatePeriod,
  type PricingPresetId,
} from '../../lib/pricingEstimate';

/** Slider ticks are held as *daily* figures; Monthly renders the same index × 30. */
const INCOMING_PER_DAY = [10, 25, 30, 50, 100, 200, 500, 1000] as const;
/** 0–100% (was 0–50). 20 is included so `DEFAULT_VOICE_SHARE` lands on a tick. */
const VOICE_PERCENT = [0, 10, 20, 25, 50, 100] as const;

const DEFAULT_PRESET = PRICING_PRESETS[0];
const DEFAULT_INCOMING_INDEX = nearestStepIndex(INCOMING_PER_DAY, DEFAULT_PRESET.messagesPerDay);
const DEFAULT_VOICE_INDEX = nearestStepIndex(VOICE_PERCENT, PRICING_CONFIG.DEFAULT_VOICE_SHARE);

const formatCount = (value: number) => value.toLocaleString('en-IN');

/** Tick labels sit in a tight row on a 390 phone, so long figures are abbreviated. */
function formatTickCount(value: number): string {
  if (value < 1000) {
    return String(value);
  }
  const thousands = value / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

function PricingEyebrow() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6f1] px-3 py-1">
      <TryCardIcon className="h-3.5 w-3.5 text-[#128C7E]" />
      <span className={sectionEyebrowClass}>{pricingCalculator.eyebrow}</span>
    </span>
  );
}

function PeriodToggle({
  period,
  onChange,
}: {
  period: PricingEstimatePeriod;
  onChange: (period: PricingEstimatePeriod) => void;
}) {
  const options = [
    { id: 'daily' as const, label: pricingCalculator.period.daily },
    { id: 'monthly' as const, label: pricingCalculator.period.monthly },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-[11px] font-medium text-slate-500 sm:text-[12px]">{pricingCalculator.period.label}</span>
      <div
        role="group"
        aria-label={pricingCalculator.period.label}
        className="inline-flex rounded-full bg-gray-100 p-1"
      >
        {options.map((option) => {
          const selected = option.id === period;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
              className={`min-h-[36px] rounded-full px-4 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#128C7E] focus-visible:ring-offset-1 sm:text-[13px] ${
                selected ? 'bg-white text-primary-500 shadow-sm' : 'text-slate-500 hover:text-primary-500'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VolumePresets({
  selected,
  onSelect,
}: {
  selected: PricingPresetId | null;
  onSelect: (id: PricingPresetId) => void;
}) {
  return (
    <div role="group" aria-label={pricingCalculator.presets.label} className="flex flex-wrap gap-2">
      {PRICING_PRESETS.map((preset) => {
        const copy = pricingCalculator.presets[preset.id];
        const pressed = selected === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(preset.id)}
            className={`min-h-[44px] min-w-0 flex-1 basis-[9.5rem] rounded-xl px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#128C7E] focus-visible:ring-offset-1 ${
              pressed
                ? 'bg-white text-primary-500 shadow-sm ring-1 ring-gray-200'
                : 'bg-white/60 text-slate-500 ring-1 ring-gray-200 hover:text-primary-500'
            }`}
          >
            <span className="block text-[12px] font-semibold sm:text-[13px]">{copy.label}</span>
            <span className="block text-[10px] font-medium text-slate-500 sm:text-[11px]">{copy.sublabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PricingCalculatorSection() {
  const [period, setPeriod] = useState<PricingEstimatePeriod>('daily');
  const [selectedPreset, setSelectedPreset] = useState<PricingPresetId | null>(DEFAULT_PRESET.id);
  const [incomingIndex, setIncomingIndex] = useState(DEFAULT_INCOMING_INDEX);
  const [voiceIndex, setVoiceIndex] = useState(DEFAULT_VOICE_INDEX);

  const isMonthly = period === 'monthly';
  const dailyMessages = INCOMING_PER_DAY[incomingIndex];
  const voicePercent = VOICE_PERCENT[voiceIndex];

  // The slider index — not the displayed figure — is the state, so flipping the period
  // relabels the same volume rather than re-estimating a different month.
  const incomingValues = useMemo(
    () => (isMonthly ? INCOMING_PER_DAY.map((value) => value * DAYS_PER_MONTH) : [...INCOMING_PER_DAY]),
    [isMonthly],
  );

  const estimate = estimateMonthlySpend({
    period,
    dailyMessages,
    monthlyMessages: dailyMessages * DAYS_PER_MONTH,
    voiceShare: voicePercent / 100,
    monthlyPromo: 0,
  });

  const allowanceLabel = formatCount(PRICING_CONFIG.WA_FREE_ALLOWANCE_PER_MONTH);
  const monthlyMessagesLabel = formatCount(estimate.monthlyMessages);
  const strip =
    estimate.monthlyMessages > PRICING_CONFIG.WA_FREE_ALLOWANCE_PER_MONTH
      ? pricingCalculator.stripOverAllowance(monthlyMessagesLabel, allowanceLabel)
      : pricingCalculator.stripWithinAllowance(monthlyMessagesLabel, allowanceLabel);

  const applyPreset = (id: PricingPresetId) => {
    const preset = PRICING_PRESETS.find((item) => item.id === id);
    if (!preset) {
      return;
    }
    setSelectedPreset(id);
    setIncomingIndex(nearestStepIndex(INCOMING_PER_DAY, preset.messagesPerDay));
    setVoiceIndex(nearestStepIndex(VOICE_PERCENT, PRICING_CONFIG.DEFAULT_VOICE_SHARE));
  };

  const onIncomingIndexChange = (index: number) => {
    setIncomingIndex(index);
    setSelectedPreset(null);
  };

  const onVoiceIndexChange = (index: number) => {
    setVoiceIndex(index);
    setSelectedPreset(null);
  };

  return (
    <SectionShell
      id="pricing"
      viewport
      className="bg-white !py-3 sm:!py-4 lg:!py-5"
      innerClassName="max-lg:!justify-start"
    >
      <div className="flex w-full flex-col gap-6 lg:h-full lg:min-h-0 lg:justify-center lg:gap-7">
        {/* `items-center` rather than Try's `items-start`: the result card is a third of
            the height of the copy + slider column, so top-aligning it leaves the whole
            lower right of the section empty. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center lg:gap-10">
          <div>
            <PricingEyebrow />
            <h2 className={`mt-3 ${sectionHeadingClass}`}>
              {pricingCalculator.headlineBefore}
              <span className="mt-1 block text-[#128C7E]">{pricingCalculator.headlineHighlight}</span>
            </h2>
            <p className={`mt-2.5 max-w-xl ${sectionBodyClass}`}>{pricingCalculator.body}</p>

            <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:p-5">
              <PeriodToggle period={period} onChange={setPeriod} />
              <div className="mt-3">
                <VolumePresets selected={selectedPreset} onSelect={applyPreset} />
              </div>
              <div className="mt-3 space-y-3.5">
                <StepSlider
                  label={pricingCalculator.sliders.incoming}
                  values={incomingValues}
                  index={incomingIndex}
                  onIndexChange={onIncomingIndexChange}
                  formatValue={(value) =>
                    isMonthly
                      ? pricingCalculator.sliderValue.incomingMonthly(formatCount(value))
                      : pricingCalculator.sliderValue.incomingDaily(formatCount(value))
                  }
                  formatValueText={(value) =>
                    isMonthly
                      ? pricingCalculator.sliderValueText.incomingMonthly(formatCount(value))
                      : pricingCalculator.sliderValueText.incomingDaily(formatCount(value))
                  }
                  formatTick={formatTickCount}
                />
                <StepSlider
                  label={pricingCalculator.sliders.voice}
                  helper={pricingCalculator.sliders.voiceHelper}
                  values={VOICE_PERCENT}
                  index={voiceIndex}
                  onIndexChange={onVoiceIndexChange}
                  formatValue={(value) => pricingCalculator.sliderValue.voice(String(value))}
                  formatValueText={(value) => pricingCalculator.sliderValueText.voice(String(value))}
                  formatTick={(value) => `${value}%`}
                />
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="relative">
              <div
                className="pointer-events-none absolute -top-8 left-1/2 h-32 w-full -translate-x-1/2 rounded-full bg-[#128C7E]/10 blur-2xl"
                aria-hidden
              />
              <div className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_20px_45px_-25px_rgba(15,107,92,0.35)] sm:p-6">
                <p className={sectionEyebrowClass}>{pricingCalculator.result.label}</p>
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2" aria-live="polite">
                  <span className="section-title font-display text-[2rem] font-extrabold leading-[1.05] tabular-nums text-primary-500 sm:text-[2.5rem] xl:text-[2.9rem]">
                    {pricingCalculator.result.amount(
                      formatCount(estimate.monthlyLow),
                      formatCount(estimate.monthlyHigh),
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-500 sm:text-[14px]">
                    {pricingCalculator.result.suffix}
                  </span>
                </p>
                <p className="mt-1.5 text-[12px] font-medium tabular-nums text-slate-500 sm:text-[13px]">
                  {pricingCalculator.result.perDay(
                    formatCount(estimate.dailyLow),
                    formatCount(estimate.dailyHigh),
                  )}
                </p>
                <p className="mt-3 rounded-xl bg-[#e7f6f1] px-3.5 py-2.5 text-[11.5px] font-medium leading-5 text-primary-500 sm:text-[12.5px]">
                  {strip}
                </p>
                {/* TODO(owner B1): breakdown line — does the ₹ range include WhatsApp's fee? Skip until confirmed. */}
                <div className="mt-4">
                  <p className="text-[13px] font-semibold text-primary-500">{pricingCalculator.included.label}</p>
                  <ul className="mt-2.5 space-y-2">
                    {pricingCalculator.included.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-1.5">
                        <IncludedStar className="h-4 w-4 shrink-0 text-warning-500 sm:h-[1.15rem] sm:w-[1.15rem]" />
                        <span className="text-[12px] font-medium leading-5 text-primary-500 sm:text-[13px]">
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {/* TODO(owner B5): optional extra item "No setup fee. Unused balance stays in your wallet."
                      only if true for all users, not just the trial. Do not add until confirmed. */}
                </div>
                <PortalCta href={site.urls.tryFree} size="lg" className="mt-4 w-full gap-2 text-[14px] font-semibold">
                  {pricingCalculator.cta(TRIAL_GRANT_RUPEES)}
                  <span aria-hidden>→</span>
                </PortalCta>
                {/*
                  TODO(owner B2): do prices include GST? Do not add a GST sentence until confirmed.
                  TODO(owner B3): wallet-zero behavior (alert? replies pause?) and minimum top-up. Add no copy yet.
                  TODO(owner B4): try-box "₹50 / ~250 test chats" vs this calculator's per-message range. Do not edit the try-box.
                */}
                <p className="mt-3 text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                  {pricingCalculator.footnote(formatRatesEffective(), allowanceLabel)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
