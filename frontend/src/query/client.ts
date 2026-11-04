import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, isCsrfFailure } from '../api/client';
import { queryKeys } from './keys';
import { PERSIST_MAX_AGE } from './persister';

/** A 401, or a 403 that is not a stale CSRF token, means the server no longer knows this session. */
const sessionLost = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 401 || (error.status === 403 && !isCsrfFailure(error)));

export function createQueryClient({ retry = 2 }: { retry?: number | false } = {}) {
  // Setting `me` to null sends the guard to login and clears local data (AppProviders).
  const endSession = () => client.setQueryData(queryKeys.me, null);
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (sessionLost(error) && query.queryKey[0] !== queryKeys.me[0]) endSession();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (sessionLost(error)) endSession();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Must outlive the persisted cache, or restored data is dropped right away.
        gcTime: PERSIST_MAX_AGE,
        retry: (count, error) =>
          error instanceof ApiError && error.status >= 400 && error.status < 500
            ? false
            : retry !== false && count < retry,
        refetchOnWindowFocus: true,
      },
      mutations: {
        // Fail fast with "Sin conexión" instead of silently pausing a save.
        networkMode: 'always',
        retry: false,
      },
    },
  });
  return client;
}
