import { Link } from 'react-router-dom';
import { Card, Button } from '@chatlogix/ui';

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-12 px-4 sm:px-6">
      <Card className="p-8 sm:p-10 text-center border border-gray-200/90 shadow-sm bg-white">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 mb-6">
          <svg
            className="h-8 w-8 text-primary-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 7.5h.008v.008H12v-.008Z"
            />
          </svg>
        </div>

        <span className="text-xs font-bold uppercase tracking-wider text-primary-600">
          404 Error
        </span>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Page not found
        </h1>

        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
          The page you're looking for doesn't exist, has been moved, or is temporarily unavailable.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/dashboard" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm shadow-xs">
              &larr; Back to Dashboard
            </Button>
          </Link>
          <Link to="/support" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              className="w-full sm:w-auto px-5 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
            >
              Contact Support
            </Button>
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-3">Popular destinations:</p>
          <div className="flex flex-wrap justify-center gap-4 text-xs font-semibold text-primary-600">
            <Link to="/orders" className="hover:underline">Orders</Link>
            <span className="text-gray-300">&bull;</span>
            <Link to="/catalog" className="hover:underline">Catalog</Link>
            <span className="text-gray-300">&bull;</span>
            <Link to="/queries" className="hover:underline">Queries</Link>
            <span className="text-gray-300">&bull;</span>
            <Link to="/wallet" className="hover:underline">Wallet</Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default NotFound;

