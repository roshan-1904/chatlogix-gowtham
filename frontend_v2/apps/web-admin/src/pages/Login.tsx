import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BrandLogo, Button } from '@chatlogix/ui';
import { useAuth } from '@chatlogix/auth';

export function Login() {
  const navigate = useNavigate();
  const { sendCode, login, logout, isAuthenticated, isLoading: authLoading, hasRole } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sessionInfo, setSessionInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated && hasRole('admin')) {
    return <Navigate to="/dashboard" replace />;
  }

  const normalizedPhone = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;

  const handleSendCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await sendCode(normalizedPhone);
      setSessionInfo(response.sessionInfo);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionInfo) {
      setError('That code expired. Ask for a new one.');
      setStep('phone');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(normalizedPhone, sessionInfo, code.trim());
      void navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not match.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <BrandLogo className="mb-6 h-8 w-auto" />
        <h1 className="text-2xl font-bold text-[#072349]">Sign in to Admin</h1>
        <p className="mt-1 text-sm text-gray-600">
          Use your admin account to review vendors and keep ChatLogix running.
        </p>

        {isAuthenticated && !hasRole('admin') && !authLoading && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            That account is not an admin.{' '}
            <button type="button" className="font-semibold underline" onClick={() => void logout()}>
              Sign out
            </button>{' '}
            and try another number.
          </div>
        )}

        {step === 'phone' ? (
          <form className="mt-6 space-y-4" onSubmit={(e) => void handleSendCode(e)}>
            <div>
              <label htmlFor="admin-phone" className="block text-sm font-medium text-gray-700">
                Mobile number
              </label>
              <input
                id="admin-phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={busy || !phone.trim()}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={(e) => void handleVerify(e)}>
            <div>
              <label htmlFor="admin-code" className="block text-sm font-medium text-gray-700">
                Code sent to {normalizedPhone}
              </label>
              <input
                id="admin-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tracking-widest text-gray-900 outline-none placeholder:tracking-normal placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={busy || !code.trim()}>
              {busy ? 'Checking…' : 'Sign in'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
            >
              Use a different number
            </Button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
