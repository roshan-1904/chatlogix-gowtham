import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLogin, useAuth } from '@chatlogix/auth';
import { BrandLogo } from '@chatlogix/ui';
import { z } from 'zod';
import { normalizePhoneToE164 } from '@chatlogix/utils';
import { PhoneLoginForm } from '../components/auth/PhoneLoginForm';
import { OtpVerificationForm } from '../components/auth/OtpVerificationForm';
import { executeFirebaseRecaptcha } from '../lib/firebaseRecaptcha';
import { mapOnboardingError } from '../components/onboarding/mapOnboardingError';
import { redirectPathForStatus, fetchOnboardingProfile } from '../lib/onboarding';

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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sessionInfo, setSessionInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtpHint, setDevOtpHint] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      void fetchOnboardingProfile()
        .then((profile) => {
          navigate(redirectPathForStatus(profile.registrationStatus as any, profile.onboardingStep), {
            replace: true,
          });
        })
        .catch(() => navigate('/dashboard', { replace: true }));
    }
  }, [isAuthenticated, authLoading, navigate]);

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
      // Validate 10-digit phone number
      if (data.phone.length !== 10 || !/^\d+$/.test(data.phone)) {
        setError('Please enter a valid 10-digit mobile number');
        setIsLoading(false);
        return;
      }

      // Combine country code and phone number
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
      // Get the phone from the form state
      const phoneData = phoneForm.getValues();
      const fullPhone = `${phoneData.countryCode}${phoneData.phone}`;
      const normalizedPhone = normalizePhoneToE164(fullPhone);
      
      await login(normalizedPhone, sessionInfo, data.otp);
      const profile = await fetchOnboardingProfile();
      navigate(redirectPathForStatus(profile.registrationStatus, profile.onboardingStep));
    } catch (err) {
      setError(mapOnboardingError(err));
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
      // Get the phone from the form state
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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Side - Branding & Content */}
      <div className="hidden lg:flex lg:flex-[0.65] lg:flex-col lg:justify-center lg:px-8 xl:px-12 bg-primary-500 text-white">
        <div className="max-w-xl mx-auto">
          <div className="mb-6">
            <BrandLogo variant="icon" className="mb-6 h-12 w-12 rounded-lg" />
            <h1 className="text-3xl xl:text-4xl font-bold mb-3">Your WhatsApp shop, on autopilot</h1>
            <p className="text-base xl:text-lg text-white/90">
              AI answers customers from your catalog and helps turn chats into orders — while you run the business.
            </p>
          </div>

          <div className="space-y-5 xl:space-y-6 mt-8">
            <div className="flex items-start gap-3 xl:gap-4">
              <div className="flex-shrink-0 w-10 h-10 xl:w-12 xl:h-12 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 xl:w-6 xl:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg xl:text-xl mb-1">WhatsApp Automation</h3>
                <p className="text-sm xl:text-base text-white/80">
                  Engage customers instantly through WhatsApp with intelligent, AI-driven responses tailored to your business.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 xl:gap-4">
              <div className="flex-shrink-0 w-10 h-10 xl:w-12 xl:h-12 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 xl:w-6 xl:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg xl:text-xl mb-1">Smart Order Management</h3>
                <p className="text-sm xl:text-base text-white/80">
                  Track orders, manage inventory, and send automated updates - effortlessly and in real time.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 xl:gap-4">
              <div className="flex-shrink-0 w-10 h-10 xl:w-12 xl:h-12 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 xl:w-6 xl:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg xl:text-xl mb-1">Actionable Customer Insights</h3>
                <p className="text-sm xl:text-base text-white/80">
                  Understand customer behavior, improve conversions, and grow your business with data-backed insights.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 xl:mt-12 pt-6 xl:pt-8 border-t border-white/20">
            <p className="text-xs xl:text-sm text-white/70">
              Trusted by modern businesses to simplify communication and accelerate growth.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 lg:flex-[0.35] flex flex-col justify-center py-8 sm:py-10 lg:py-12 px-4 sm:px-6 lg:px-12 xl:px-20 bg-gray-50">
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-6 sm:mb-8">
            <div className="mb-5">
              <BrandLogo className="h-12 w-auto sm:h-14 lg:h-16" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              {step === 'phone' ? 'Welcome back' : 'Verify your phone'}
            </h2>
            <p className="text-sm sm:text-base text-gray-600">
              {step === 'phone'
                ? 'Sign in to continue managing your business.'
                : 'Enter the verification code sent to your phone'}
            </p>
          </div>

          {error && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-xs sm:text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:p-8">
            {step === 'phone' ? (
              <PhoneLoginForm
                form={phoneForm}
                onSubmit={handleSendCode}
                isLoading={isLoading}
              />
            ) : (
              <>
                {devOtpHint && (
                  <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    Local auth is using the development code <strong>123456</strong>. Production uses a real SMS from Firebase.
                  </p>
                )}
              <OtpVerificationForm
                form={otpForm}
                onSubmit={handleVerifyCode}
                phoneNumber={phoneNumber}
                isLoading={isLoading}
                onBack={handleBack}
                onResend={handleResendCode}
              />
              </>
            )}
          </div>

          <div className="mt-6 sm:mt-8 text-center space-y-2">
            <p className="text-xs sm:text-sm text-gray-600">
              New here?{' '}
              <Link to="/signup" className="text-primary-500 hover:opacity-80 font-medium">
                Start free WhatsApp trial
              </Link>
            </p>
            <p className="text-xs sm:text-sm text-gray-600">
              By continuing, you agree to our{' '}
              <a
                href="https://chatlogix.in/terms"
                target="_blank"
                rel="noreferrer"
                className="text-primary-500 hover:opacity-80 font-medium"
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href="https://chatlogix.in/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-primary-500 hover:opacity-80 font-medium"
              >
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}