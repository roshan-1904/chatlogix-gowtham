import { getApiUrl } from './env';

const RECAPTCHA_SCRIPT_ID = 'chatlogix-recaptcha-script';
const RECAPTCHA_CONTAINER_ID = 'chatlogix-recaptcha-container';

interface RecaptchaParams {
  recaptchaSiteKey: string;
  recaptchaStoken: string;
}

interface Grecaptcha {
  ready: (callback: () => void) => void;
  render: (
    container: HTMLElement | string,
    parameters: {
      sitekey: string;
      stoken?: string;
      size?: 'invisible' | 'compact' | 'normal';
      callback?: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
    }
  ) => number;
  execute: (widgetId: number) => void;
  reset: (widgetId: number) => void;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

let scriptPromise: Promise<void> | null = null;
let widgetId: number | null = null;
let initPromise: Promise<void> | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;

function loadGrecaptchaScript(): Promise<void> {
  if (window.grecaptcha) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA')));
      return;
    }

    const script = document.createElement('script');
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load reCAPTCHA script'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function fetchRecaptchaParams(): Promise<RecaptchaParams> {
  const response = await fetch(`${getApiUrl()}/auth/recaptcha-params`);
  if (!response.ok) {
    throw new Error('Could not load reCAPTCHA configuration from the server');
  }
  return response.json() as Promise<RecaptchaParams>;
}

function getRecaptchaContainer(): HTMLElement {
  let container = document.getElementById(RECAPTCHA_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = RECAPTCHA_CONTAINER_ID;
    container.style.display = 'none';
    document.body.appendChild(container);
  }
  return container;
}

async function ensureRecaptchaWidget(): Promise<number> {
  if (widgetId !== null) {
    return widgetId;
  }
  if (initPromise) {
    await initPromise;
    return widgetId!;
  }

  initPromise = (async () => {
    await loadGrecaptchaScript();
    const params = await fetchRecaptchaParams();
    const grecaptcha = window.grecaptcha;
    if (!grecaptcha) {
      throw new Error('reCAPTCHA is not available');
    }

    await new Promise<void>((resolve) => {
      grecaptcha.ready(() => resolve());
    });

    widgetId = grecaptcha.render(getRecaptchaContainer(), {
      sitekey: params.recaptchaSiteKey,
      stoken: params.recaptchaStoken,
      size: 'invisible',
      callback: (token: string) => {
        pendingResolve?.(token);
        pendingResolve = null;
        pendingReject = null;
      },
      'error-callback': () => {
        pendingReject?.(new Error('reCAPTCHA verification failed'));
        pendingResolve = null;
        pendingReject = null;
      },
      'expired-callback': () => {
        pendingReject?.(new Error('reCAPTCHA expired. Please try again.'));
        pendingResolve = null;
        pendingReject = null;
      },
    });
  })();

  await initPromise;
  return widgetId!;
}

/**
 * Obtain a Firebase-compatible reCAPTCHA token via Identity Toolkit recaptchaParams + stoken.
 * Required for sendVerificationCode — static site keys from .env alone cause SITE_MISMATCH.
 */
export async function executeFirebaseRecaptcha(): Promise<string> {
  await loadGrecaptchaScript();
  const id = await ensureRecaptchaWidget();
  const grecaptcha = window.grecaptcha;
  if (!grecaptcha) {
    throw new Error('reCAPTCHA is not available');
  }

  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    grecaptcha.ready(() => {
      grecaptcha.reset(id);
      grecaptcha.execute(id);
    });
  });
}
