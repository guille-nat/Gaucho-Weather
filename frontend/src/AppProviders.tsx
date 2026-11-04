import type { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider, type Persister } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';
import { PERSISTED_ROOTS } from './query/keys';
import { PERSIST_BUSTER, PERSIST_MAX_AGE } from './query/persister';

interface AppProvidersProps {
  queryClient: QueryClient;
  persister: Persister;
  children: ReactNode;
}

/** Query cache persisted to IndexedDB: the last good lotes stay readable with no signal. */
export function AppProviders({ queryClient, persister, children }: AppProvidersProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: PERSIST_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && PERSISTED_ROOTS.has(String(query.queryKey[0])),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
