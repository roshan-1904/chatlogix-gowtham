import { executeFirebaseRecaptcha as executeRecaptcha } from '@chatlogix/auth';
import { API_URL } from './api';

export async function executeFirebaseRecaptcha(): Promise<string> {
  return executeRecaptcha(API_URL);
}
