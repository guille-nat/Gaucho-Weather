import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

export const PERSIST_KEY = 'gaucho-weather-query-cache';
/** Bump when a persisted shape changes, so old caches are discarded instead of misread. */
// v2: lotes are persisted as a `LotesSnapshot` (list plus the time the server produced it).
// v3: drops entries persisted by the abandoned fileteado build (2026-11-03).
export const PERSIST_BUSTER = 'v3';
/** Last good data stays usable offline for a week. */
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Persists the TanStack Query cache in IndexedDB (async, no 5 MB localStorage limit). */
export function createIdbPersister(key = PERSIST_KEY): Persister {
  return {
    persistClient: (client: PersistedClient) => set(key, client),
    restoreClient: () => get<PersistedClient>(key),
    removeClient: () => del(key),
  };
}
