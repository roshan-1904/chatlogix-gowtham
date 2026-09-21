import type { UseFormReturn } from 'react-hook-form';
import { useRef, useEffect, useState } from 'react';
import { Button } from '../primitives';

export interface OtpVerificationFormProps {
  form: UseFormReturn<{ otp: string }>;
  onSubmit: (data: { otp: string }) => void;
  phoneNumber: string;
  isLoading: boolean;
  onBack: () => void;
  onResend: () => Promise<void>;
  submitLabel?: string;
}

export function OtpVerificationForm({
  form,
  onSubmit,
  phoneNumber,
  isLoading,
  onBack,
  onResend,
  submitLabel = 'Verify Code',
}: OtpVerificationFormProps) {
  const [otpValues, setOtpValues] = useState<string[]>(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(30);
  const [isResending, setIsResending] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autoSubmittedOtp = useRef<string | null>(null);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const otpString = otpValues.join('');
    form.setValue('otp', otpString, { shouldValidate: false });
  }, [otpValues, form]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => {
        setResendTimer(resendTimer - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [resendTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    const otpString = otpValues.join('');

    if (otpString.length !== 6) {
      form.setValue('otp', otpString, { shouldValidate: true });
      return;
    }

    if (isLoading && autoSubmittedOtp.current === otpString) return;
    autoSubmittedOtp.current = otpString;
    form.handleSubmit(onSubmit)(e);
  };

  const handleResend = async () => {
    if (resendTimer > 0 || isResending) return;

    setIsResending(true);
    try {
      await onResend();
      setResendTimer(30);
      setOtpValues(['', '', '', '', '', '']);
      form.reset();
      setHasSubmitted(false);
      autoSubmittedOtp.current = null;
      inputRefs.current[0]?.focus();
    } catch {
      // Error handling is done in parent component
    } finally {
      setIsResending(false);
    }
  };

  const tryAutoSubmit = (values: string[]) => {
    const otp = values.join('');
    if (otp.length !== 6 || isLoading || autoSubmittedOtp.current === otp) return;
    autoSubmittedOtp.current = otp;
    setHasSubmitted(true);
    form.setValue('otp', otp, { shouldValidate: true });
    onSubmit({ otp });
  };

  const applyDigits = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    const newOtpValues = [...otpValues];

    if (!digits) {
      newOtpValues[index] = '';
      setOtpValues(newOtpValues);
      return;
    }

    digits.slice(0, 6 - index).split('').forEach((digit, offset) => {
      newOtpValues[index + offset] = digit;
    });
    setOtpValues(newOtpValues);

    const nextEmptyIndex = newOtpValues.findIndex((val) => val === '');
    const focusIndex = nextEmptyIndex === -1 ? 5 : Math.min(nextEmptyIndex, 5);
    inputRefs.current[focusIndex]?.focus();
    tryAutoSubmit(newOtpValues);
  };

  const handleChange = (index: number, value: string) => {
    applyDigits(index, value);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    applyDigits(digits.length === 6 ? 0 : index, digits);
  };

  const handleFocus = (index: number) => {
    inputRefs.current[index]?.select();
  };

  const otpString = otpValues.join('');
  const showError = hasSubmitted && form.formState.errors.otp;
  const isComplete = otpString.length === 6;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-600">
            We sent a verification code to <span className="font-medium text-gray-900">{phoneNumber}</span>
          </p>
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="text-sm text-primary-500 hover:opacity-80 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Change
          </button>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-3">
          Verification Code
        </label>

        <div className="flex justify-center gap-2 sm:gap-3">
          {otpValues.map((value, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              value={value}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={(e) => handlePaste(index, e)}
              onFocus={() => handleFocus(index)}
              disabled={isLoading}
              className={`
                min-h-12 min-w-11 h-12 w-11 sm:h-14 sm:w-12 text-center text-xl font-semibold text-gray-900
                border-2 rounded-lg transition-all
                focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1
                disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  showError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-300 hover:border-gray-400'
                }
              `}
            />
          ))}
        </div>

        {showError && (
          <p className="mt-2 text-sm text-red-600">{form.formState.errors.otp?.message}</p>
        )}
      </div>

      <div className="space-y-3">
        <Button
          type="submit"
          disabled={isLoading || !isComplete}
          isLoading={isLoading}
          className="w-full"
        >
          {isLoading ? 'Verifying...' : submitLabel}
        </Button>

        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">
            Didn&apos;t receive the code?
          </p>
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={resendTimer > 0 || isResending || isLoading}
            className="text-sm text-primary-500 hover:opacity-80 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isResending
              ? 'Sending...'
              : resendTimer > 0
              ? `Resend code in ${resendTimer}s`
              : 'Resend code'}
          </button>
        </div>
      </div>
    </form>
  );
}
