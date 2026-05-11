import React, { FormEvent, useMemo, useRef, useState } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useAuth, UserRole } from './AuthContext';
import { sendVerificationCode, verifyCode } from './api';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export const LoginPage: React.FC = () => {
  const { login, setAuthenticating } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sessionInfo, setSessionInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA | null>(null);

  const recaptchaSiteKey = useMemo<string | null>(() => {
    const value = (import.meta as any).env.VITE_RECAPTCHA_SITE_KEY;
    return value ? String(value) : null;
  }, []);

  const handleSendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const trimmed = phoneNumber.trim();
    if (!PHONE_REGEX.test(trimmed)) {
      setError('Enter a valid phone number in international format (e.g., +15551234567).');
      return;
    }

    try {
      setIsLoading(true);
      let recaptchaToken = '';

      if (recaptchaSiteKey) {
        const token = await recaptchaRef.current?.executeAsync();
        if (!token) {
          throw new Error('reCAPTCHA verification failed. Please try again.');
        }
        recaptchaToken = token;
        recaptchaRef.current?.reset();
      }

      const response = await sendVerificationCode(trimmed, recaptchaToken);
      setSessionInfo(response.sessionInfo);
      setStep('otp');
      setInfo('Verification code sent. Enter the code you received via SMS.');
    } catch (apiError: any) {
      setError(apiError.message || 'Failed to send verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!verificationCode.trim()) {
      setError('Enter the verification code you received.');
      return;
    }

    try {
      setIsLoading(true);
      setAuthenticating(true);
      const response = await verifyCode(phoneNumber.trim(), sessionInfo, verificationCode.trim());
      const normalizedRoles = (response.user.roles || []).map((role) =>
        role === 'admin' ? 'admin' : 'vendor'
      ) as UserRole[];
      login(response.token, {
        phoneNumber: response.user.phoneNumber,
        roles: normalizedRoles,
        vendorId: response.user.vendorId ?? null
      });
      setInfo('Login successful! Redirecting...');
    } catch (apiError: any) {
      setError(apiError.message || 'Failed to verify code.');
    } finally {
      setIsLoading(false);
      setAuthenticating(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>ChatLogix Login</h1>
        <p style={styles.subtitle}>
          Sign in with your verified phone number to access vendor tools.
        </p>

        {error && <div style={styles.error}>{error}</div>}
        {info && <div style={styles.info}>{info}</div>}

        {step === 'phone' ? (
          <form onSubmit={handleSendCode} style={styles.form}>
            <label style={styles.label} htmlFor="phone-number">
              Phone Number
            </label>
            <input
              id="phone-number"
              type="tel"
              placeholder="+15551234567"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              style={styles.input}
              disabled={isLoading}
              autoComplete="tel"
              required
            />
            <button type="submit" style={styles.primaryButton} disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} style={styles.form}>
            <label style={styles.label} htmlFor="otp-code">
              Verification Code
            </label>
            <input
              id="otp-code"
              type="text"
              placeholder="Enter the 6-digit code"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              style={styles.input}
              disabled={isLoading}
              inputMode="numeric"
              pattern="\d{4,6}"
              required
            />
            <button type="submit" style={styles.primaryButton} disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Verify & Continue'}
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                setStep('phone');
                setVerificationCode('');
                setSessionInfo('');
                setInfo('Try again with your phone number.');
              }}
              disabled={isLoading}
            >
              Use a different number
            </button>
          </form>
        )}

        {recaptchaSiteKey && (
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey={recaptchaSiteKey}
            size="invisible"
            style={{ display: 'none' }}
          />
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
    padding: '1.5rem'
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#fff',
    borderRadius: '20px',
    padding: '2.5rem',
    boxShadow: '0 20px 45px -15px rgba(15, 23, 42, 0.35)',
    textAlign: 'center'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: '0.5rem'
  },
  subtitle: {
    fontSize: '0.95rem',
    color: '#475569',
    marginBottom: '1.75rem'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  label: {
    textAlign: 'left',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#334155'
  },
  input: {
    padding: '0.85rem 1rem',
    borderRadius: '10px',
    border: '1px solid #cbd5f5',
    fontSize: '1rem',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    outline: 'none'
  },
  primaryButton: {
    padding: '0.9rem 1rem',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    color: '#fff',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.2s ease'
  },
  secondaryButton: {
    padding: '0.8rem 1rem',
    borderRadius: '12px',
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
    border: '1px solid #e2e8f0',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.2s ease'
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    marginBottom: '1rem',
    fontSize: '0.9rem'
  },
  info: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    marginBottom: '1rem',
    fontSize: '0.9rem'
  }
};


