import { ApiError, apiFetch } from './client';
import type { User } from './types';

/** The logged-in user, or null when the session is anonymous (403). */
export async function fetchMe(): Promise<User | null> {
  try {
    return await apiFetch<User>('/api/auth/me/');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 401)) return null;
    throw error;
  }
}

export const login = (input: { email: string; password: string }) =>
  apiFetch<User>('/api/auth/login/', { method: 'POST', body: input });

export const register = (input: { email: string; password: string; name: string }) =>
  apiFetch<User>('/api/auth/register/', { method: 'POST', body: input });

export const logout = () => apiFetch<void>('/api/auth/logout/', { method: 'POST' });
