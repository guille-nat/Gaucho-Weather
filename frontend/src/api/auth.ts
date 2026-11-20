import { ApiError, apiFetch } from './client';
import type { User } from './types';

/**
 * Set when the user left with no signal: the session cookie is httpOnly, so only the server can
 * end it. The next session check with signal ends it there before anything else.
 */
const PENDING_LOGOUT = 'gw-pending-logout';

function readPendingLogout(): boolean {
  try {
    return localStorage.getItem(PENDING_LOGOUT) === '1';
  } catch {
    return false;
  }
}

export function markPendingLogout() {
  try {
    localStorage.setItem(PENDING_LOGOUT, '1');
  } catch {
    // Storage blocked: the local sign-out still happened; the server session expires on its own.
  }
}

export function clearPendingLogout() {
  try {
    localStorage.removeItem(PENDING_LOGOUT);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

export const logout = () => apiFetch<void>('/api/auth/logout/', { method: 'POST' });

/** The logged-in user, or null when the session is anonymous (403) or was left locally. */
export async function fetchMe(): Promise<User | null> {
  if (readPendingLogout()) {
    try {
      await logout();
      clearPendingLogout();
    } catch (error) {
      // Still no signal: stay signed out here and try again on the next check.
      if (!(error instanceof ApiError && error.isNetwork)) clearPendingLogout();
    }
    return null;
  }
  try {
    return await apiFetch<User>('/api/auth/me/');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 401)) return null;
    throw error;
  }
}

export const login = (input: { email: string; password: string }) =>
  apiFetch<User>('/api/auth/login/', { method: 'POST', body: input });

/** `acepta_terminos` false answers `{acepta_terminos: [...]}` (promociones S0b). */
export const register = (input: {
  email: string;
  password: string;
  name: string;
  acepta_terminos: boolean;
}) => apiFetch<User>('/api/auth/register/', { method: 'POST', body: input });

/** Accepts the current terms version (promociones S0c); answers the account like `me`. */
export const acceptTerms = () => apiFetch<User>('/api/auth/terminos/aceptar/', { method: 'POST' });
