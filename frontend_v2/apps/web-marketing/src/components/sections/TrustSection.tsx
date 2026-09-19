import { SectionShell } from '../SectionShell';
import { TrustLockIcon } from '../trust/TrustIcons';
import { TrustStepCards } from '../trust/TrustStepCards';
import { trust } from '../../copy';
import { sectionBodyClass, sectionEyebrowClass, sectionHeadingClass } from '../../lib/pageLayout';

function TrustEyebrow() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#128C7E]/25 bg-white px-3 py-1">
      <TrustLockIcon className="h-3.5 w-3.5 text-[#128C7E]" />
      <span className={sectionEyebrowClass}>{trust.eyebrow}</span>
    </span>
  );
}

export function TrustSection() {
  return (
    <SectionShell
      id="trust"
      viewport
      className="bg-white !py-3 sm:!py-4 lg:!py-5"
      innerClassName="max-lg:!justify-start"
    >
      <div className="flex w-full flex-col gap-4 sm:gap-5 lg:h-full lg:min-h-0 lg:justify-center lg:gap-5 xl:gap-6">
        <header className="mx-auto w-full max-w-5xl text-center">
          <TrustEyebrow />
          <h2 className={`mt-3 ${sectionHeadingClass}`}>
            {trust.headlineBefore}
            <span className="mt-1 block text-[#128C7E]">{trust.headlineHighlight}</span>
          </h2>
          <p className={`mx-auto mt-2.5 max-w-3xl ${sectionBodyClass}`}>{trust.body}</p>
        </header>

        <TrustStepCards />
      </div>
    </SectionShell>
  );
}
