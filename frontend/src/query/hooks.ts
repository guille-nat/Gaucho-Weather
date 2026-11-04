import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearPendingLogout, fetchMe, markPendingLogout } from '../api/auth';
import { createLote, deleteLote, getLote, listLotes, updateLote } from '../api/lotes';
import type { Lote, LoteInput, LotesSnapshot, User } from '../api/types';
import { queryKeys } from './keys';
import { useLocalData } from './localData';

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: fetchMe });

export const useLotes = () => useQuery({ queryKey: queryKeys.lotes, queryFn: listLotes });

export function useLote(id: number) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.lote(id),
    queryFn: () => getLote(id),
    enabled: Number.isFinite(id),
    // Open instantly (and offline) from the list we already have.
    initialData: () =>
      queryClient.getQueryData<LotesSnapshot>(queryKeys.lotes)?.items.find((l) => l.id === id),
    initialDataUpdatedAt: () => queryClient.getQueryState(queryKeys.lotes)?.dataUpdatedAt,
  });
}

const byName = (a: Lote, b: Lote) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

function useStoreLote() {
  const queryClient = useQueryClient();
  const localData = useLocalData();
  return async (lote: Lote) => {
    queryClient.setQueryData(queryKeys.lote(lote.id), lote);
    queryClient.setQueryData<LotesSnapshot>(queryKeys.lotes, (list) =>
      list
        ? { ...list, items: [...list.items.filter((l) => l.id !== lote.id), lote].sort(byName) }
        : list,
    );
    // Persist before the screen changes: a reload right after saving must keep the lote.
    await localData.flush();
    void queryClient.invalidateQueries({ queryKey: queryKeys.lotes, exact: true });
  };
}

export function useCreateLote() {
  const store = useStoreLote();
  return useMutation({ mutationFn: (input: LoteInput) => createLote(input), onSuccess: store });
}

export function useUpdateLote(id: number) {
  const store = useStoreLote();
  return useMutation({
    mutationFn: (input: Partial<LoteInput>) => updateLote(id, input),
    onSuccess: store,
  });
}

export function useDeleteLote(id: number) {
  const queryClient = useQueryClient();
  const localData = useLocalData();
  return useMutation({
    mutationFn: () => deleteLote(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: queryKeys.lote(id), exact: true });
      queryClient.setQueryData<LotesSnapshot>(queryKeys.lotes, (list) =>
        list ? { ...list, items: list.items.filter((l) => l.id !== id) } : list,
      );
      await localData.flush();
    },
  });
}

/** A new session starts clean: cached data of whoever used the phone before must not leak. */
export function useStartSession() {
  const queryClient = useQueryClient();
  const localData = useLocalData();
  return async (user: User) => {
    await localData.clear();
    clearPendingLogout();
    queryClient.setQueryData(queryKeys.me, user);
  };
}

/**
 * Ends the session on this phone. `localOnly` when the server could not be told (no signal):
 * the logout is then retried at the next session check.
 */
export function useEndSession() {
  const queryClient = useQueryClient();
  const localData = useLocalData();
  return async ({ localOnly }: { localOnly: boolean }) => {
    if (localOnly) markPendingLogout();
    queryClient.setQueryData(queryKeys.me, null);
    await localData.clear();
  };
}
