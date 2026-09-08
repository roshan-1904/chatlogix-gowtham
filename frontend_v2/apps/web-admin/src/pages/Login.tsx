import { BrandLogo } from '@chatlogix/ui';

export function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <BrandLogo className="mb-6 h-8 w-auto" />
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Sign in to Admin</h1>
        <p className="text-gray-600 mb-4">Use your admin account to review vendors and keep ChatLogix running.</p>
        <button className="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700">
          Login (Placeholder)
        </button>
      </div>
    </div>
  );
}

