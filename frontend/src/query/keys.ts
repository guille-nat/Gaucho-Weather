/** Coordinates in a key are rounded like the request (src/api/pronostico.ts). */
const at = (lat: number, lon: number) => [Number(lat.toFixed(3)), Number(lon.toFixed(3))] as const;

export const queryKeys = {
  me: ['me'] as const,
  lotes: ['lotes'] as const,
  lote: (id: number) => ['lotes', id] as const,
  /** Under `lotes`: private, persisted and cleared with the rest of the account. */
  loteForecast: (id: number) => ['lotes', id, 'pronostico'] as const,
  /** Under `lotes` too: private (cleared at logout) and persisted, so a range seen stays offline. */
  loteHistory: (id: number, from: string, to: string) =>
    ['lotes', id, 'historico', from, to] as const,
  forecast: (lat: number, lon: number) => ['pronostico', ...at(lat, lon)] as const,
  places: (query: string) => ['lugares', query] as const,
  placeName: (lat: number, lon: number) => ['lugares', 'reverso', ...at(lat, lon)] as const,
  plans: ['planes'] as const,
  /** Private to the account: persisted (readable offline) and cleared when the session ends. */
  subscription: ['suscripcion'] as const,
  /** Private to the account: persisted (readable offline) and cleared when the session ends. */
  alertRules: ['alertas', 'reglas'] as const,
  alertInbox: ['alertas', 'eventos'] as const,
  /** Push state of this browser, not of the server: never persisted, cleared at session end. */
  pushHere: ['push'] as const,
  /** The account's Mercado Pago subscription and payments: private, persisted like `suscripcion`. */
  payments: ['pagos'] as const,
  /**
   * Super admin data of every account: never persisted (it must not sit on a phone), cleared at
   * session end. Each list is keyed by its filters and page.
   */
  backoffice: ['backoffice'] as const,
  backofficeList: (list: string, params: Record<string, string | number>) =>
    ['backoffice', list, params] as const,
};

/**
 * Only these survive a reload or a dead signal: the user, their lotes, alerts and subscription,
 * and the public forecast.
 */
export const PERSISTED_ROOTS = new Set<string>([
  'me',
  'lotes',
  'alertas',
  'suscripcion',
  'pagos',
  'pronostico',
]);

/** Public data (not of any account): it stays when a session ends (see query/session.ts). */
export const PUBLIC_ROOTS = new Set<string>(['pronostico', 'lugares', 'planes']);
