import { usePageMeta } from '@chatlogix/hooks';
import { MarketingLayout } from '../components/MarketingLayout';
import { HeroSection } from '../components/sections/HeroSection';
import { ProblemSection } from '../components/sections/ProblemSection';
import { SolutionSection } from '../components/sections/SolutionSection';
import { HowItWorksSection } from '../components/sections/HowItWorksSection';
import { CustomerExperienceSection } from '../components/sections/CustomerExperienceSection';
import { TrustSection } from '../components/sections/TrustSection';
import { TryWithProductsSection } from '../components/sections/TryWithProductsSection';
import { PricingCalculatorSection } from '../components/sections/PricingCalculatorSection';
import { FaqCtaSection } from '../components/sections/FaqCtaSection';
import { homeMeta } from '../copy';
import { site } from '../lib/site';

export function Home() {
  usePageMeta({
    ...homeMeta,
    canonical: `${site.siteOrigin}/`,
    robots: 'index, follow',
  });

  return (
    <MarketingLayout snapScroll>
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <HowItWorksSection />
      <CustomerExperienceSection />
      <TrustSection />
      <TryWithProductsSection />
      <PricingCalculatorSection />
      <FaqCtaSection />
    </MarketingLayout>
  );
}
