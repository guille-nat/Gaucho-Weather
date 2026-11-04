import { createContext, useContext } from 'react';

/** What the app can do with the data it keeps on this phone (see AppProviders). */
export interface LocalData {
  /** Drops the current user's data from memory, IndexedDB and the service worker cache. */
  clear: () => Promise<void>;
  /** Writes the query cache to IndexedDB now, so a reload right after a save keeps it. */
  flush: () => Promise<void>;
}

export const LocalDataContext = createContext<LocalData | null>(null);

export function useLocalData(): LocalData {
  const value = useContext(LocalDataContext);
  if (!value) throw new Error('useLocalData needs <AppProviders>');
  return value;
}
