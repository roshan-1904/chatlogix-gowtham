import { onboardingCopy } from './onboardingCopy';
import { SignupDemoPreview } from './SignupDemoPreview';
import { SignupTrustLines } from './SignupTrustLines';

export function SignupMarketingPanel() {
  const { hero, problem } = onboardingCopy.signup.marketing;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="text-sm font-medium uppercase tracking-wide text-secondary-600">{hero.kicker}</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-balance text-primary-500 xl:text-[2.6rem]">
        {hero.h1}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-gray-600">{hero.subhead}</p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">{problem.h2}</h2>
        <ul className="mt-3 space-y-3">
          {problem.bullets.map((b) => (
            <li key={b.title}>
              <p className="text-sm font-medium text-gray-900">{b.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{b.body}</p>
            </li>
          ))}
        </ul>
      </div>

      <SignupDemoPreview />

      <SignupTrustLines className="mt-6" />
    </div>
  );
}
