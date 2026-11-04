import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { queryKeys } from './keys';
import { PERSIST_MAX_AGE } from './persister';

export function createQueryClient({ retry = 2 }: { retry?: number | false } = {}) {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // A GET that comes back 401/403 means the session ended: the guard sends us to login.
        const authLost =
          error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (authLost && query.queryKey[0] !== queryKeys.me[0]) {
          client.setQueryData(queryKeys.me, null);
        }
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
