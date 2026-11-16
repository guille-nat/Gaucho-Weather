import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateAccount, type AccountChanges } from '../api/account';
import { clearPendingLogout, fetchMe, markPendingLogout } from '../api/auth';
import { ApiError } from '../api/client';
import { getLoteHistory } from '../api/historico';
import { createLote, deleteLote, getLote, listLotes, updateLote } from '../api/lotes';
import { getPlans } from '../api/plans';
import {
  getForecast,
  asForecastSnapshot,
  getLoteForecast,
  reversePlace,
  searchPlaces,
} from '../api/pronostico';
import type { Lote, LoteInput, LotesSnapshot, User } from '../api/types';
import { queryKeys } from './keys';
import { useLocalData } from './localData';

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: fetchMe });

/** PATCH /api/auth/me/; the answer is the whole account, so it replaces `me` as is. */
export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: AccountChanges) => updateAccount(changes),
    onSuccess: (user: User) => queryClient.setQueryData(queryKeys.me, user),
  });
}

export const useLotes = () => useQuery({ queryKey: queryKeys.lotes, queryFn: listLotes });

/** The public price table; it changes only when staff edit a plan. */
export const usePlans = () =>
  useQuery({ queryKey: queryKeys.plans, queryFn: getPlans, staleTime: 10 * 60_000 });

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

/** The public forecast of a point (S10). `null` coordinates wait for the location. */
export function useForecast(point: { lat: number; lon: number } | null) {
  return useQuery({
    queryKey: point ? queryKeys.forecast(point.lat, point.lon) : ['pronostico', 'none'],
    queryFn: () => getForecast(point!.lat, point!.lon),
    enabled: point !== null,
    // A cold cell takes over a second; keep the previous sky on screen while the next one loads.
    placeholderData: (previous) => previous,
  });
}

export const useLoteForecast = (id: number) =>
  useQuery({
    queryKey: queryKeys.loteForecast(id),
    queryFn: () => getLoteForecast(id),
    select: asForecastSnapshot,
    enabled: Number.isFinite(id),
  });

/** Places matching a search (S10); the backend wants at least 2 letters. */
export const usePlaceSearch = (query: string) =>
  useQuery({
    queryKey: queryKeys.places(query),
    queryFn: ({ signal }) => searchPlaces(query, signal),
    enabled: query.length >= 2,
    staleTime: 60 * 60_000,
  });

/** The name of where the phone is; `null` when unknown (outside Argentina answers 400). */
export const usePlaceName = (point: { lat: number; lon: number } | null) =>
  useQuery({
    queryKey: point ? queryKeys.placeName(point.lat, point.lon) : ['lugares', 'reverso', 'none'],
    queryFn: async () => {
      try {
        return await reversePlace(point!.lat, point!.lon);
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) return null;
        throw error;
      }
    },
    enabled: point !== null,
    staleTime: 24 * 60 * 60_000,
  });

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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoteInput) => createLote(input),
    onSuccess: async (lote: Lote) => {
      // Awaited: the screen changes only once the lote is persisted (see useStoreLote).
      await store(lote);
      // The account's usage counts lotes (S4).
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
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

/**
 * Past weather of a lote (cuenta-planes-alertas S9, S10). Every range is its own key under the
 * persisted `lotes` root; a shorter gcTime keeps only ranges seen in the last day, so the
 * persisted cache does not grow with every range someone browses.
 */
export const useLoteHistory = (id: number, from: string, to: string) =>
  useQuery({
    queryKey: queryKeys.loteHistory(id, from, to),
    queryFn: () => getLoteHistory(id, from, to),
    enabled: Number.isFinite(id),
    gcTime: 24 * 60 * 60_000,
    // Keep the previous range of the same lote on screen while the next one loads.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === id ? previous : undefined,
  });
