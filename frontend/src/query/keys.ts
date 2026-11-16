/** Coordinates in a key are rounded like the request (src/api/pronostico.ts). */
const at = (lat: number, lon: number) => [Number(lat.toFixed(3)), Number(lon.toFixed(3))] as const;

export const queryKeys = {
  me: ['me'] as const,
  lotes: ['lotes'] as const,
  lote: (id: number) => ['lotes', id] as const,
  /** Under `lotes`: private, persisted and cleared with the rest of the account. */
  loteForecast: (id: number) => ['lotes', id, 'pronostico'] as const,
  forecast: (lat: number, lon: number) => ['pronostico', ...at(lat, lon)] as const,
  places: (query: string) => ['lugares', query] as const,
  placeName: (lat: number, lon: number) => ['lugares', 'reverso', ...at(lat, lon)] as const,
  plans: ['planes'] as const,
};

/** Only these survive a reload or a dead signal: the user, their lotes and the public forecast. */
export const PERSISTED_ROOTS = new Set<string>(['me', 'lotes', 'pronostico']);

/** Public data (not of any account): it stays when a session ends (see query/session.ts). */
export const PUBLIC_ROOTS = new Set<string>(['pronostico', 'lugares', 'planes']);
