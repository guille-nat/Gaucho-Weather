/**
 * Why someone just left, for the login screen to say it.
 *
 * Leaving ends the session and navigates to /ingresar with the reason in the router state, but
 * under load the private-route guard can redirect first, with its own state, and the reason
 * was lost ("Borramos tu cuenta…" never shown). The reason is also kept here, in memory, until
 * the login screen shows it. In memory only: a reload starts clean.
 */
export type SignedOutReason = 'server' | 'local' | 'deleted';

let pending: SignedOutReason | null = null;

export function rememberSignedOut(reason: SignedOutReason): void {
  pending = reason;
}

/** The remembered reason, without clearing it (safe to call twice under StrictMode). */
export function peekSignedOut(): SignedOutReason | null {
  return pending;
}

export function clearSignedOut(): void {
  pending = null;
}
