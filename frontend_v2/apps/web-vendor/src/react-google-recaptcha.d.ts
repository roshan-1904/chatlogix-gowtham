declare module 'react-google-recaptcha' {
  import { Component } from 'react';

  export interface ReCAPTCHAProps {
    sitekey: string;
    onChange?: (token: string | null) => void;
    onExpired?: () => void;
    onError?: (error: Error) => void;
    size?: 'compact' | 'normal' | 'invisible';
    theme?: 'light' | 'dark';
    type?: 'image' | 'audio';
    tabindex?: number;
    hl?: string;
    badge?: 'bottomright' | 'bottomleft' | 'inline';
    stoken?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    grecaptcha?: any;
    isolated?: boolean;
    asyncScriptOnLoad?: () => void | null;
  }

  export default class ReCAPTCHA extends Component<ReCAPTCHAProps> {
    execute(): void;
    executeAsync(): Promise<string | null>;
    reset(): void;
    getValue(): string | null;
  }
}

