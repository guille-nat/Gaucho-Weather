/**
 * The terms bundle (promociones S0a, S0b): Términos y condiciones, Política de privacidad and the
 * program rules. One version for the three pages. It must equal `TERMS_VERSION` in
 * `backend/apps/accounts/terms.py`: the backend decides whether an account accepted it, the pages
 * show it, and a test fails when the two drift apart.
 */
export const TERMS_VERSION = '2026-11-19';

const longDate = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "19 de noviembre de 2026": the version is the date it takes effect. */
export const termsDate = (version = TERMS_VERSION) =>
  longDate.format(new Date(`${version}T00:00:00Z`));

export const LEGAL_PAGES = [
  { to: '/terminos', label: 'Términos y condiciones' },
  { to: '/privacidad', label: 'Política de privacidad' },
  { to: '/reglas', label: 'Reglas del programa' },
] as const;

export const TERMS_REQUIRED = 'Tenés que aceptar los términos y la política de privacidad.';
