import type { ReactNode } from 'react';
import { onboardingCopy } from './onboardingCopy';

interface PublicAuthSplitProps {
  marketing: ReactNode;
  children: ReactNode;
}

export function PublicAuthSplit({ marketing, children }: PublicAuthSplitProps) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden min-h-screen overflow-y-auto border-r border-gray-200 bg-gray-50 px-12 lg:flex lg:w-[60%] lg:flex-col xl:px-16">
        <div className="my-auto w-full py-12">{marketing}</div>
      </aside>
      <div className="flex flex-1 flex-col justify-center bg-white px-5 py-10 sm:px-10 lg:w-[40%] lg:px-16">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

export function PublicAuthLegalNote() {
  const { agree, and, terms, privacy, termsUrl, privacyUrl } = onboardingCopy.signup.legal;

  return (
    <p className="mt-4 text-center text-sm text-gray-600">
      {agree}{' '}
      <a
        href={termsUrl}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary-500 hover:opacity-80"
      >
        {terms}
      </a>{' '}
      {and}{' '}
      <a
        href={privacyUrl}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary-500 hover:opacity-80"
      >
        {privacy}
      </a>
    </p>
  );
}
