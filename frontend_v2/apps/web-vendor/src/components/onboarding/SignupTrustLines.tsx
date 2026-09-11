import { onboardingCopy } from './onboardingCopy';

interface SignupTrustLinesProps {
  className?: string;
}

export function SignupTrustLines({ className }: SignupTrustLinesProps) {
  const { trust } = onboardingCopy.signup.marketing;

  return (
    <ul className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      {trust.map((line) => (
        <li key={line} className="flex items-start gap-2.5 text-sm text-gray-600">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary-500" aria-hidden />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
