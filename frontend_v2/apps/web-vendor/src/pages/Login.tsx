import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import ReCAPTCHA from 'react-google-recaptcha';
import { useLogin, useAuth } from '@chatlogix/auth';
import { z } from 'zod';
import { normalizePhoneToE164 } from '@chatlogix/utils';
import { PhoneLoginForm } from '../components/auth/PhoneLoginForm';
import { OtpVerificationForm } from '../components/auth/OtpVerificationForm';
import { getRecaptchaSiteKey } from '../lib/env';

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

// Get reCAPTCHA site key from environment variables
// This ensures it's loaded from .env.local (dev) or .env.production (build)
const RECAPTCHA_SITE_KEY = getRecaptchaSiteKey();

export function Login() {
  const navigate = useNavigate();
  const { login, sendCode } = useLogin();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sessionInfo, setSessionInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
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

      // Get reCAPTCHA token if available
      let recaptchaToken: string | undefined;
      if (RECAPTCHA_SITE_KEY && recaptchaRef.current) {
        try {
          recaptchaToken = await recaptchaRef.current.executeAsync() || undefined;
        } catch (recaptchaError) {
          const errorMessage = RECAPTCHA_SITE_KEY.includes('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI')
            ? 'reCAPTCHA configuration error: The test site key does not match Firebase configuration. Please configure the correct reCAPTCHA site key in Firebase Console and update VITE_RECAPTCHA_SITE_KEY in your .env.local file.'
            : 'reCAPTCHA verification failed. Please try again.';
          setError(errorMessage);
          setIsLoading(false);
          if (recaptchaRef.current) {
            recaptchaRef.current.reset();
          }
          return;
        }
      } else if (!RECAPTCHA_SITE_KEY) {
        setError('reCAPTCHA is not configured. Please set VITE_RECAPTCHA_SITE_KEY in your .env.local file.');
        setIsLoading(false);
        return;
      }

      // Send code with normalized phone (E.164 format) and reCAPTCHA token
      const response = await sendCode(normalizedPhone, recaptchaToken);
      setPhoneNumber(`${data.countryCode} ${data.phone}`);
      setSessionInfo(response.sessionInfo);
      setStep('otp');
      
      // Reset reCAPTCHA after successful submission
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
      // Reset reCAPTCHA on error
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
      }
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
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecaptchaError = (error: Error) => {
    console.error('reCAPTCHA error:', error);
    setError(`reCAPTCHA error: ${error.message}. Check browser console for details.`);
  };

  const handleBack = () => {
    setStep('phone');
    setError(null);
    setSessionInfo(null);
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

      // Get reCAPTCHA token if available
      let recaptchaToken: string | undefined;
      if (RECAPTCHA_SITE_KEY && recaptchaRef.current) {
        try {
          recaptchaToken = await recaptchaRef.current.executeAsync() || undefined;
        } catch (recaptchaError) {
          const errorMessage = RECAPTCHA_SITE_KEY.includes('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI')
            ? 'reCAPTCHA configuration error: The test site key does not match Firebase configuration. Please configure the correct reCAPTCHA site key in Firebase Console and update VITE_RECAPTCHA_SITE_KEY in your .env.local file.'
            : 'reCAPTCHA verification failed. Please try again.';
          setError(errorMessage);
          setIsLoading(false);
          if (recaptchaRef.current) {
            recaptchaRef.current.reset();
          }
          throw new Error(errorMessage);
        }
      } else if (!RECAPTCHA_SITE_KEY) {
        const errorMsg = 'reCAPTCHA is not configured. Please set VITE_RECAPTCHA_SITE_KEY in your .env.local file.';
        setError(errorMsg);
        setIsLoading(false);
        throw new Error(errorMsg);
      }

      // Resend code with normalized phone (E.164 format) and reCAPTCHA token
      const response = await sendCode(normalizedPhone, recaptchaToken);
      setSessionInfo(response.sessionInfo);
      
      // Reset reCAPTCHA after successful submission
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
      // Reset reCAPTCHA on error
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
      }
      throw err; // Re-throw to let the component handle it
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
            <h1 className="text-3xl xl:text-4xl font-bold mb-3">Welcome to ChatLogix</h1>
            <p className="text-base xl:text-lg text-white/90">
              Streamline your customer conversations, orders, and business workflows <br className="hidden xl:block" />- all in one powerful platform.
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
            <div className="flex items-center gap-2 mb-3 lg:hidden">
              <div className="w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-xl">C</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ChatLogix</h1>
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
                recaptchaRef={recaptchaRef}
                recaptchaSiteKey={RECAPTCHA_SITE_KEY}
                onRecaptchaError={handleRecaptchaError}
              />
            ) : (
              <OtpVerificationForm
                form={otpForm}
                onSubmit={handleVerifyCode}
                phoneNumber={phoneNumber}
                isLoading={isLoading}
                onBack={handleBack}
                onResend={handleResendCode}
              />
            )}
          </div>

          <div className="mt-6 sm:mt-8 text-center">
            <p className="text-xs sm:text-sm text-gray-600">
              By continuing, you agree to our{' '}
              <a href="#" className="text-primary-500 hover:opacity-80 font-medium">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-primary-500 hover:opacity-80 font-medium">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}