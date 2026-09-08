import { Link } from 'react-router-dom';
import { MarketingLayout } from '../components/MarketingLayout';
import { usePageMeta } from '../hooks/usePageMeta';
import { about, aboutMeta } from '../copy';

export function About() {
  usePageMeta(aboutMeta);

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">{about.headline}</h1>
        <p className="mt-6 text-lg leading-relaxed text-gray-600">{about.body}</p>
        <p className="mt-8">
          <Link to="/" className="text-sm font-medium text-primary-500 hover:opacity-80">
            Back to home
          </Link>
        </p>
      </div>
    </MarketingLayout>
  );
}
