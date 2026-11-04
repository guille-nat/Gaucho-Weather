export const queryKeys = {
  me: ['me'] as const,
  lotes: ['lotes'] as const,
  lote: (id: number) => ['lotes', id] as const,
};

/** Only these survive a reload or a dead signal: the user and their lotes. */
export const PERSISTED_ROOTS = new Set<string>(['me', 'lotes']);
