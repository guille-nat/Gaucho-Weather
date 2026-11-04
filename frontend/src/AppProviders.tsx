import type { QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  persistQueryClientSave,
  type Persister,
  type PersistQueryClientOptions,
} from '@tanstack/react-query-persist-client';
import { useEffect, useMemo, type ReactNode } from 'react';
import { PERSISTED_ROOTS } from './query/keys';
import { LocalDataContext, type LocalData } from './query/localData';
import { PERSIST_BUSTER, PERSIST_MAX_AGE } from './query/persister';
import { clearLocalData, onSessionEnd } from './query/session';

interface AppProvidersProps {
  queryClient: QueryClient;
  persister: Persister;
  children: ReactNode;
}

/** Query cache persisted to IndexedDB: the last good lotes stay readable with no signal. */
export function AppProviders({ queryClient, persister, children }: AppProvidersProps) {
  const persistOptions = useMemo(
    (): Omit<PersistQueryClientOptions, 'queryClient'> => ({
      persister,
      maxAge: PERSIST_MAX_AGE,
      buster: PERSIST_BUSTER,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) =>
          query.state.status === 'success' && PERSISTED_ROOTS.has(String(query.queryKey[0])),
      },
    }),
    [persister],
  );

  const localData = useMemo(
    (): LocalData => ({
      clear: () => clearLocalData(queryClient, persister),
      flush: () => persistQueryClientSave({ queryClient, ...persistOptions }),
    }),
    [queryClient, persister, persistOptions],
  );

  // Whenever the session ends, for any reason, the next person on this phone sees nothing of it.
  useEffect(
    () => onSessionEnd(queryClient, () => void localData.clear()),
    [queryClient, localData],
  );

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <LocalDataContext.Provider value={localData}>{children}</LocalDataContext.Provider>
    </PersistQueryClientProvider>
  );
}
