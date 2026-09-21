import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLogin, useAuth } from '@chatlogix/auth';
import { BrandLogo, PhoneLoginForm, OtpVerificationForm } from '@chatlogix/ui';
import { z } from 'zod';
import { normalizePhoneToE164 } from '@chatlogix/utils';
import { executeFirebaseRecaptcha } from '../lib/firebaseRecaptcha';
import { LoginMarketingPanel } from '../components/onboarding/LoginMarketingPanel';
import { onboardingCopy } from '../components/onboarding/onboardingCopy';
import { PublicAuthLegalNote, PublicAuthSplit } from '../components/onboarding/PublicAuthSplit';
import { SignupDemoPreview } from '../components/onboarding/SignupDemoPreview';
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
  const loginForm = onboardingCopy.login.form;

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
    <PublicAuthSplit marketing={<LoginMarketingPanel />}>
      <div className="mb-6">
        <BrandLogo className="h-12 w-auto sm:h-14 lg:h-16" />
      </div>

      {step === 'phone' ? (
        <div className="mb-6 lg:hidden">
          <SignupDemoPreview compact />
        </div>
      ) : null}

      <h1 className="text-4xl font-semibold leading-tight tracking-tight text-gray-900 xl:text-[2.6rem]">
        {step === 'phone' ? loginForm.title : loginForm.otpTitle}
      </h1>
      <p className="mt-4 mb-6 text-base leading-relaxed text-gray-600">
        {step === 'phone' ? loginForm.subtext : loginForm.otpSubtext}
      </p>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{error}</p>
        </div>
      )}

      {step === 'phone' ? (
        <PhoneLoginForm
          form={phoneForm}
          onSubmit={handleSendCode}
          isLoading={isLoading}
          submitLabel={loginForm.cta}
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

      <PublicAuthLegalNote />

      <p className="mt-8 text-center text-base text-gray-600">
        {loginForm.footerSignup}{' '}
        <Link to="/signup" className="font-medium text-primary-500 hover:opacity-80">
          {loginForm.footerSignupLink}
        </Link>
      </p>
    </PublicAuthSplit>
  );
}
