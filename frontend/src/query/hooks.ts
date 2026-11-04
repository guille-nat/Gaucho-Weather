import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe } from '../api/auth';
import { createLote, deleteLote, getLote, listLotes, updateLote } from '../api/lotes';
import type { Lote, LoteInput, User } from '../api/types';
import { queryKeys } from './keys';

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: fetchMe });

export const useLotes = () => useQuery({ queryKey: queryKeys.lotes, queryFn: listLotes });

export function useLote(id: number) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.lote(id),
    queryFn: () => getLote(id),
    enabled: Number.isFinite(id),
    // Open instantly (and offline) from the list we already have.
    initialData: () => queryClient.getQueryData<Lote[]>(queryKeys.lotes)?.find((l) => l.id === id),
    initialDataUpdatedAt: () => queryClient.getQueryState(queryKeys.lotes)?.dataUpdatedAt,
  });
}

function useStoreLote() {
  const queryClient = useQueryClient();
  return (lote: Lote) => {
    queryClient.setQueryData(queryKeys.lote(lote.id), lote);
    queryClient.setQueryData<Lote[]>(queryKeys.lotes, (list) =>
      list
        ? [...list.filter((l) => l.id !== lote.id), lote].sort((a, b) =>
            a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
          )
        : list,
    );
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
  return useMutation({
    mutationFn: () => deleteLote(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.lote(id), exact: true });
      queryClient.setQueryData<Lote[]>(queryKeys.lotes, (list) => list?.filter((l) => l.id !== id));
    },
  });
}

/** After a login, cached data of whoever used the phone before must not leak. */
export function useStartSession() {
  const queryClient = useQueryClient();
  return (user: User) => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
    queryClient.setQueryData(queryKeys.me, user);
  };
}
