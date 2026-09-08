import { MarketingLayout } from '../components/MarketingLayout';
import { HeroSection } from '../components/sections/HeroSection';
import { ProblemSection } from '../components/sections/ProblemSection';
import { SolutionSection } from '../components/sections/SolutionSection';
import { HowItWorksSection } from '../components/sections/HowItWorksSection';
import { CustomerExperienceSection } from '../components/sections/CustomerExperienceSection';
import { TrustSection } from '../components/sections/TrustSection';
import { TryWithProductsSection } from '../components/sections/TryWithProductsSection';
import { FaqCtaSection } from '../components/sections/FaqCtaSection';
import { usePageMeta } from '../hooks/usePageMeta';
import { homeMeta } from '../copy';

export function Home() {
  usePageMeta(homeMeta);

  return (
    <MarketingLayout snapScroll>
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <HowItWorksSection />
      <CustomerExperienceSection />
      <TrustSection />
      <TryWithProductsSection />
      <FaqCtaSection />
    </MarketingLayout>
  );
}
