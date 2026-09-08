import { onboardingCopy } from './onboardingCopy';
import { SignupDemoPreview } from './SignupDemoPreview';

export function SignupMarketingPanel() {
  const { hero, problem } = onboardingCopy.signup.marketing;

  return (
    <div className="hidden min-h-screen lg:flex lg:w-[60%] lg:flex-col lg:justify-center border-r border-gray-200 bg-gray-50 px-12 xl:px-16">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wide text-secondary-600">{hero.kicker}</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-balance text-primary-500 xl:text-[2.6rem]">
          {hero.h1}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-gray-600">{hero.subhead}</p>

        <SignupDemoPreview />

        <div className="sr-only">
          <h2>{problem.h2}</h2>
          {problem.bullets.map((b) => (
            <p key={b.title}>
              {b.title}. {b.body}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
