const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';

export interface SendCodeResponse {
  sessionInfo: string;
  expiresIn: number;
}

export interface VerifyCodeResponse {
  token: string;
  user: {
    phoneNumber: string;
    roles: string[];
    vendorId?: string;
  };
  isNewUser?: boolean;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      errorBody?.error?.message ||
      errorBody?.message ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function sendVerificationCode(
  phoneNumber: string,
  recaptchaToken: string
): Promise<SendCodeResponse> {
  const response = await fetch(`${API_URL}/auth/send-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ phoneNumber, recaptchaToken })
  });

  return handleResponse<SendCodeResponse>(response);
}

export async function verifyCode(
  phoneNumber: string,
  sessionInfo: string,
  code: string
): Promise<VerifyCodeResponse> {
  const response = await fetch(`${API_URL}/auth/verify-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ phoneNumber, sessionInfo, code })
  });

  return handleResponse<VerifyCodeResponse>(response);
}


