import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BrandLogo, PhoneLoginForm, OtpVerificationForm } from '@chatlogix/ui';
import { useLogin, useAuth } from '@chatlogix/auth';
import { normalizePhoneToE164 } from '@chatlogix/utils';
import { executeFirebaseRecaptcha } from '../lib/firebaseRecaptcha';

const phoneSchema = z.object({
  countryCode: z.string().min(1, 'Country code is required'),
  phone: z
    .string()
    .min(10, 'Phone number must be 10 digits')
    .max(10, 'Phone number must be 10 digits')
    .regex(/^\d+$/, 'Phone number must contain only digits'),
});

const otpSchema = z.object({
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type OtpFormData = z.infer<typeof otpSchema>;

export function Login() {
  const navigate = useNavigate();
  const { login, sendCode } = useLogin();
  const { logout, isAuthenticated, isLoading: authLoading, hasRole } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sessionInfo, setSessionInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtpHint, setDevOtpHint] = useState(false);

  if (isAuthenticated && hasRole('admin')) {
    return <Navigate to="/dashboard" replace />;
  }

  const phoneForm = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      countryCode: '+91',
      phone: '',
    },
  });

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
  });

  const resolveRecaptchaToken = async (): Promise<string | undefined> => {
    try {
      return await executeFirebaseRecaptcha();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (
        !import.meta.env.PROD &&
        message.includes('Could not load reCAPTCHA configuration')
      ) {
        return undefined;
      }
      throw err instanceof Error ? err : new Error('reCAPTCHA verification failed. Please try again.');
    }
  };

  const handleSendCode = async (data: PhoneFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      if (data.phone.length !== 10 || !/^\d+$/.test(data.phone)) {
        setError('Please enter a valid 10-digit mobile number');
        setIsLoading(false);
        return;
      }

      const fullPhone = `${data.countryCode}${data.phone}`;
      const normalizedPhone = normalizePhoneToE164(fullPhone);
      const recaptchaToken = await resolveRecaptchaToken();
      const response = await sendCode(normalizedPhone, recaptchaToken);
      setPhoneNumber(`${data.countryCode} ${data.phone}`);
      setSessionInfo(response.sessionInfo);
      setDevOtpHint(response.delivery === 'dev');
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (data: { otp: string }) => {
    if (!sessionInfo) {
      setError('Session expired. Please try again.');
      setStep('phone');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const phoneData = phoneForm.getValues();
      const fullPhone = `${phoneData.countryCode}${phoneData.phone}`;
      const normalizedPhone = normalizePhoneToE164(fullPhone);

      await login(normalizedPhone, sessionInfo, data.otp);
      void navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not match.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('phone');
    setError(null);
    setSessionInfo(null);
    setDevOtpHint(false);
    otpForm.reset();
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const phoneData = phoneForm.getValues();
      const fullPhone = `${phoneData.countryCode}${phoneData.phone}`;
      const normalizedPhone = normalizePhoneToE164(fullPhone);
      const recaptchaToken = await resolveRecaptchaToken();
      const response = await sendCode(normalizedPhone, recaptchaToken);
      setSessionInfo(response.sessionInfo);
      setDevOtpHint(response.delivery === 'dev');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <BrandLogo className="mb-6 h-8 w-auto" />
        <h1 className="text-2xl font-bold text-[#072349]">
          {step === 'phone' ? 'Sign in to Admin' : 'Enter verification code'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {step === 'phone'
            ? 'Use your admin account to review vendors and keep ChatLogix running.'
            : 'Enter the 6-digit code we sent to your phone.'}
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

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            <p>{error}</p>
          </div>
        )}

        <div className="mt-6">
          {step === 'phone' ? (
            <PhoneLoginForm
              form={phoneForm}
              onSubmit={handleSendCode}
              isLoading={isLoading}
              phoneLabel="Mobile number"
              submitLabel="Send code"
            />
          ) : (
            <>
              {devOtpHint && (
                <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  Local auth is using the development code <strong>123456</strong>. Production uses a real SMS from
                  Firebase.
                </p>
              )}
              <OtpVerificationForm
                form={otpForm}
                onSubmit={handleVerifyCode}
                phoneNumber={phoneNumber}
                isLoading={isLoading}
                onBack={handleBack}
                onResend={handleResendCode}
                submitLabel="Sign in"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
