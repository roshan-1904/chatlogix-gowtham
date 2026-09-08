import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useLogin, useAuth } from '@chatlogix/auth';
import { Badge, BrandLogo } from '@chatlogix/ui';
import { normalizePhoneToE164 } from '@chatlogix/utils';
import { PhoneLoginForm } from '../../components/auth/PhoneLoginForm';
import { OtpVerificationForm } from '../../components/auth/OtpVerificationForm';
import { executeFirebaseRecaptcha } from '../../lib/firebaseRecaptcha';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { SignupMarketingPanel } from '../../components/onboarding/SignupMarketingPanel';
import { SignupDemoPreview } from '../../components/onboarding/SignupDemoPreview';
import { SignupFaq } from '../../components/onboarding/SignupFaq';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import { redirectPathForStatus, fetchOnboardingProfile } from '../../lib/onboarding';

const phoneSchema = z.object({
  countryCode: z.string().min(1),
  phone: z.string().min(10).max(10).regex(/^\d+$/),
});

const otpSchema = z.object({
  otp: z.string().length(6),
});

type PhoneFormData = z.infer<typeof phoneSchema>;

export function Signup() {
  const navigate = useNavigate();
  const { signup, sendCode } = useLogin();
  const { isAuthenticated, user } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [sessionInfo, setSessionInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtpHint, setDevOtpHint] = useState(false);

  const { form: formCopy, marketing } = onboardingCopy.signup;

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchOnboardingProfile()
      .then((profile) => {
        navigate(redirectPathForStatus(profile.registrationStatus, profile.onboardingStep), {
          replace: true,
        });
      })
      .catch(() => {
        navigate(redirectPathForStatus(user?.registrationStatus, 1), { replace: true });
      });
  }, [isAuthenticated, user, navigate]);

  const phoneForm = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { countryCode: '+91', phone: '' },
  });

  const otpForm = useForm<{ otp: string }>({
    resolver: zodResolver(otpSchema),
  });

  const resolveRecaptchaToken = async () => {
    try {
      return await executeFirebaseRecaptcha();
    } catch (err) {
      if (!import.meta.env.PROD) return undefined;
      throw err instanceof Error ? err : new Error('reCAPTCHA verification failed');
    }
  };

  const handleSendCode = async (data: PhoneFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const fullPhone = normalizePhoneToE164(`${data.countryCode}${data.phone}`);
      const recaptchaToken = await resolveRecaptchaToken();
      const response = await sendCode(fullPhone, recaptchaToken);
      setSessionInfo(response.sessionInfo);
      setDevOtpHint(response.delivery === 'dev');
      setStep('otp');
    } catch (err) {
      setError(mapOnboardingError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (data: { otp: string }) => {
    if (!sessionInfo) return;
    setIsLoading(true);
    setError(null);
    try {
      const phoneData = phoneForm.getValues();
      const fullPhone = normalizePhoneToE164(`${phoneData.countryCode}${phoneData.phone}`);
      const result = await signup(fullPhone, sessionInfo, data.otp);
      toast.success(onboardingCopy.signup.success);
      navigate(result.redirectTo ?? redirectPathForStatus(result.user.registrationStatus as any, 1));
    } catch (err) {
      const msg = mapOnboardingError(err);
      setError(msg);
      if (msg.includes('already has an account')) {
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const watchedPhone = phoneForm.watch('phone');
  const watchedCountry = phoneForm.watch('countryCode');
  const otpPhoneLabel = `${watchedCountry} ${watchedPhone}`.trim();
  const otpSubtext = formCopy.otp.subtext.replace('{phone}', otpPhoneLabel || 'your phone');

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <SignupMarketingPanel />

      <div className="flex flex-1 flex-col justify-center bg-white px-5 py-10 sm:px-10 lg:w-[40%] lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6">
            <BrandLogo className="h-12 w-auto sm:h-14 lg:h-16" />
          </div>

          {step === 'phone' ? (
            <>
              <div className="mb-6 lg:hidden">
                <p className="text-sm font-medium uppercase tracking-wide text-secondary-600">
                  {marketing.hero.kicker}
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance text-gray-900">
                  {marketing.hero.h1}
                </h1>
                <SignupDemoPreview compact />
              </div>
              <Badge variant="success" className="mb-4 rounded-full px-3 py-1 !text-sm">
                {formCopy.badge}
              </Badge>
              <h2 className="text-4xl font-semibold leading-tight tracking-tight text-gray-900 xl:text-[2.6rem]">
                {formCopy.phone.title}
              </h2>
              <p className="mt-4 mb-6 text-base leading-relaxed text-gray-600">{formCopy.phone.subtext}</p>
            </>
          ) : (
            <div className="mb-6">
              <h2 className="text-4xl font-semibold leading-tight tracking-tight text-gray-900 xl:text-[2.6rem]">
                {formCopy.otp.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-gray-600">{otpSubtext}</p>
            </div>
          )}

          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>{error}</p>
              {error.includes('log in') && (
                <Link to="/login" className="mt-1 inline-block font-medium text-primary-600">
                  Log in instead
                </Link>
              )}
            </div>
          )}

          {step === 'phone' ? (
            <PhoneLoginForm
              form={phoneForm}
              onSubmit={handleSendCode}
              isLoading={isLoading}
              phoneLabel={formCopy.phone.fieldLabel}
              helperText={formCopy.phone.helper}
              submitLabel={formCopy.phone.cta}
              footnote={formCopy.phone.footnote}
              autoFocus
              labelClassName="block text-base font-medium text-gray-700 mb-2"
              helperClassName="mt-2 text-sm text-gray-600"
              footnoteClassName="mt-3 text-center text-sm text-gray-600"
            />
          ) : (
            <>
              {devOtpHint && (
                <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                  Dev OTP: <strong>123456</strong>
                </p>
              )}
              <OtpVerificationForm
                form={otpForm}
                onSubmit={handleVerify}
                phoneNumber={otpPhoneLabel}
                isLoading={isLoading}
                onBack={() => setStep('phone')}
                onResend={async () => {
                  await handleSendCode(phoneForm.getValues());
                }}
                submitLabel={formCopy.otp.cta}
              />
            </>
          )}

          <p className="mt-8 text-center text-base text-gray-600">
            {formCopy.footerLogin}{' '}
            <Link to="/login" className="font-medium text-primary-500 hover:opacity-80">
              {formCopy.footerLoginLink}
            </Link>
          </p>

          <details className="mt-10 group">
            <summary className="cursor-pointer list-none text-center text-base font-medium text-gray-600 hover:text-gray-800 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Questions?</span>
              <span className="hidden group-open:inline">Hide questions</span>
            </summary>
            <div className="text-left">
              <SignupFaq variant="light" />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
