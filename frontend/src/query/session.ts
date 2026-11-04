import type { QueryClient } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import { queryKeys } from './keys';

/** Workbox runtime cache of /api/lotes/ (vite.config.ts): private data of whoever is logged in. */
export const API_CACHE = 'api-lotes';

async function deleteApiCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(API_CACHE);
}

/**
 * Removes every trace of the current user from this phone: the in-memory queries, the copy
 * persisted in IndexedDB and the service worker's cache of the API. Only `me` survives, so the
 * caller decides who is logged in next. The phone may be shared, so this runs whenever a session
 * ends or a new one starts.
 */
export async function clearLocalData(queryClient: QueryClient, persister: Persister) {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
  await Promise.allSettled([persister.removeClient(), deleteApiCache()]);
}

/**
 * Calls `onEnd` each time `me` becomes null, whatever the reason: a 403 from /me, a 401/403 on
 * any other request (see client.ts), a logout, a local sign-out with no signal.
 */
export function onSessionEnd(queryClient: QueryClient, onEnd: () => void): () => void {
  let previous: unknown = queryClient.getQueryData(queryKeys.me);
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] !== queryKeys.me[0]) return;
    const current: unknown = event.query.state.data;
    // Run outside the cache notification that reported the change.
    if (current === null && previous !== null) queueMicrotask(onEnd);
    previous = current;
  });
}
