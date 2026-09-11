import { onboardingCopy } from './onboardingCopy';
import { SignupDemoPreview } from './SignupDemoPreview';

export function LoginMarketingPanel() {
  const { h1, subhead } = onboardingCopy.login.marketing;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance text-primary-500 xl:text-[2.6rem]">
        {h1}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-gray-600">{subhead}</p>
      <SignupDemoPreview />
    </div>
  );
}
