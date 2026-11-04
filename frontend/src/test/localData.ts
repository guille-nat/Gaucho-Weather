import { QueryClient } from '@tanstack/react-query';
import { persistQueryClientSave, type PersistedClient } from '@tanstack/react-query-persist-client';
import { get } from 'idb-keyval';
import { vi } from 'vitest';
import type { Lote, User } from '../api/types';
import { queryKeys } from '../query/keys';
import { createIdbPersister, PERSIST_BUSTER, PERSIST_KEY } from '../query/persister';

/** jsdom has no Cache Storage: stand in for the service worker's `caches`. */
export function stubCaches() {
  const remove = vi.fn(async (name: string) => Boolean(name));
  vi.stubGlobal('caches', { delete: remove });
  return remove;
}

/** Writes to IndexedDB what a previous visit (10 minutes ago, so already stale) left there. */
export async function seedPersisted({
  user,
  lotes,
  savedAt = Date.now() - 10 * 60_000,
}: {
  user: User | null;
  lotes?: Lote[];
  savedAt?: number;
}) {
  const seed = new QueryClient();
  seed.setQueryData(queryKeys.me, user, { updatedAt: savedAt });
  if (lotes) {
    seed.setQueryData(
      queryKeys.lotes,
      { items: lotes, servedAt: savedAt, fromCache: false },
      { updatedAt: savedAt },
    );
  }
  await persistQueryClientSave({
    queryClient: seed,
    persister: createIdbPersister(),
    buster: PERSIST_BUSTER,
  });
}

/** The persisted query cache as it is in IndexedDB right now. */
export async function readPersisted() {
  const entry = await get<PersistedClient>(PERSIST_KEY);
  const queries = entry?.clientState.queries ?? [];
  return {
    roots: queries.map((q) => String(q.queryKey[0])),
    text: JSON.stringify(queries),
  };
}
