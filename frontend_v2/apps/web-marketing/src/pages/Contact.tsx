import { Link } from 'react-router-dom';
import { MarketingLayout } from '../components/MarketingLayout';
import { usePageMeta } from '@chatlogix/hooks';
import { contactMeta, legalContact } from '../copy';
import { site } from '../lib/site';

export function Contact() {
  usePageMeta({
    ...contactMeta,
    canonical: site.urls.contact,
    robots: 'index, follow',
  });

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">Contact</h1>
        <p className="mt-6 text-lg leading-relaxed text-gray-600">
          Questions about privacy, these terms, or a payment collected through ChatLogix.
        </p>

        <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-6 text-gray-800">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500">Email</p>
          <p className="mt-1">
            <a
              href={`mailto:${legalContact.privacyEmail}`}
              className="font-medium text-primary-500 hover:opacity-80"
            >
              {legalContact.privacyEmail}
            </a>
          </p>
          <p className="mt-6 text-sm leading-relaxed text-gray-700">
            Our registered office will be published here before live payments.
          </p>
        </div>

        <p className="mt-8 text-sm leading-relaxed text-gray-600">
          See also our{' '}
          <Link to="/privacy" className="font-medium text-primary-500 hover:opacity-80">
            Privacy Policy
          </Link>
          ,{' '}
          <Link to="/terms" className="font-medium text-primary-500 hover:opacity-80">
            Terms of Service
          </Link>
          , and{' '}
          <Link to="/refunds" className="font-medium text-primary-500 hover:opacity-80">
            Refund and cancellation policy
          </Link>
          .
        </p>

        <p className="mt-10">
          <Link to="/" className="text-sm font-medium text-primary-500 hover:opacity-80">
            Back to home
          </Link>
        </p>
      </article>
    </MarketingLayout>
  );
}
