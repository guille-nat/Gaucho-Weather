import { apiFetch } from './client';
import type { User } from './types';

/** Account management (odd/tasks/cuenta-planes-alertas.md S5). */
export interface AccountChanges {
  name?: string;
  email?: string;
  /** Needed only to change the email. */
  current_password?: string;
  notify_push?: boolean;
  notify_email?: boolean;
}

export const updateAccount = (changes: AccountChanges) =>
  apiFetch<User>('/api/auth/me/', { method: 'PATCH', body: changes });

export const changePassword = (input: { current_password: string; new_password: string }) =>
  apiFetch<void>('/api/auth/password/change/', { method: 'POST', body: input });

/** Deletes the account and everything it owns; the server ends the session. */
export const deleteAccount = (password: string) =>
  apiFetch<void>('/api/auth/me/', { method: 'DELETE', body: { password } });

/** Always succeeds: the answer never tells whether the email has an account. */
export const requestPasswordReset = (email: string) =>
  apiFetch<void>('/api/auth/password/reset/', { method: 'POST', body: { email } });

export const confirmPasswordReset = (input: { uid: string; token: string; new_password: string }) =>
  apiFetch<void>('/api/auth/password/reset/confirm/', { method: 'POST', body: input });
