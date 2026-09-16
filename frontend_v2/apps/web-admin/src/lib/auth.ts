import { AuthApi } from '@chatlogix/auth';
import { API_URL } from './api';

export const authApi = new AuthApi({ baseURL: API_URL });
