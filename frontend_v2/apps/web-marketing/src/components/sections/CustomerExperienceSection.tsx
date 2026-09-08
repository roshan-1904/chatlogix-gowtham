import {
  ClockGrowIcon,
  LightningIcon,
  PeopleIcon,
  ShieldCheckIcon,
  ThreadIcon,
} from '../hero/HeroIcons';
import { FeatureBulletList } from '../FeatureBulletList';
import { LanguageMobileStrip } from '../natural/LanguageExamples';
import { NaturalConversationDemo } from '../natural/NaturalConversationDemo';
import { SectionShell } from '../SectionShell';
import { customerExperience } from '../../copy';
import { sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';

const benefitIconById = {
  language: { Icon: ThreadIcon, wrap: 'bg-emerald-50 text-[#0f6b5c]' },
  instant: { Icon: LightningIcon, wrap: 'bg-blue-50 text-blue-600' },
  scale: { Icon: PeopleIcon, wrap: 'bg-violet-50 text-violet-600' },
  reliable: { Icon: ShieldCheckIcon, wrap: 'bg-emerald-50 text-[#0f6b5c]' },
};

const statIconById = {
  always: ClockGrowIcon,
  volume: PeopleIcon,
  speed: LightningIcon,
};

function TrustNote() {
  return (
    <div className="mt-3 rounded-2xl bg-[#e7f6f1] px-3.5 py-3 sm:mt-4">
      <p className="text-[13px] font-semibold text-primary-500">{customerExperience.trustLine}</p>
      <p className="mt-0.5 text-[12px] leading-5 text-slate-600">{customerExperience.trustSubline}</p>
    </div>
  );
}

function VendorTranslationNote() {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-[#e7f6f1] px-3.5 py-3 text-center sm:text-left">
      <p className="text-[13px] font-semibold text-primary-500">
        {customerExperience.vendorTranslationLine}
      </p>
      <p className="mt-0.5 text-[12px] leading-5 text-slate-600">
        {customerExperience.vendorTranslationSubline}
      </p>
    </div>
  );
}

function ScaleStats() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {customerExperience.stats.map((stat) => {
        const Icon = statIconById[stat.id];
        return (
          <div
            key={stat.id}
            className="flex min-w-0 flex-col items-start gap-1.5 rounded-2xl border border-gray-200 bg-white px-2.5 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#0f6b5c] sm:h-9 sm:w-9">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-primary-500 sm:text-[15px]">{stat.value}</p>
              <p className="text-[10px] leading-4 text-slate-600 sm:text-[12px]">{stat.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CustomerExperienceSection() {
  return (
    <SectionShell
      id="natural-conversations"
      viewport
      className="bg-white !py-3 sm:!py-4 lg:!py-5"
      innerClassName="max-lg:!justify-start overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-full flex-col gap-5 lg:h-full lg:min-h-0 lg:justify-center lg:gap-5 xl:gap-6">
        <div className="grid items-start gap-5 lg:min-h-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-center lg:gap-6 xl:gap-8">
          <div className="min-w-0">
            <p className={`mb-1.5 ${sectionEyebrowClass}`}>{customerExperience.eyebrow}</p>
            <h2 className={sectionHeadingClass}>
              {customerExperience.headlineBefore}
              <span className="mt-1 block text-[#128C7E]">{customerExperience.headlineHighlight}</span>
            </h2>
            <p className={`mt-2.5 max-w-3xl ${sectionBodyClass}`}>{customerExperience.body}</p>
            <div className="mt-3 sm:mt-4">
              <FeatureBulletList items={customerExperience.benefits} iconById={benefitIconById} compact />
            </div>
            <TrustNote />
          </div>

          <div className="relative min-w-0 max-lg:shrink-0">
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#128C7E]/10 blur-3xl"
              aria-hidden
            />
            <div className="relative flex flex-col items-center gap-3">
              <NaturalConversationDemo />
              <LanguageMobileStrip />
              <VendorTranslationNote />
            </div>
          </div>
        </div>

        <ScaleStats />
      </div>
    </SectionShell>
  );
}
