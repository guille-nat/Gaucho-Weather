import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateAccount, type AccountChanges } from '../api/account';
import {
  createAlertRule,
  deleteAlertRule,
  deletePushSubscription,
  getAlertInbox,
  getPushKey,
  listAlertRules,
  markAlertsRead,
  savePushSubscription,
  updateAlertRule,
} from '../api/alerts';
import { clearPendingLogout, fetchMe, markPendingLogout } from '../api/auth';
import { ApiError } from '../api/client';
import { getLoteHistory } from '../api/historico';
import { createLote, deleteLote, getLote, listLotes, updateLote } from '../api/lotes';
import { getPlans } from '../api/plans';
import { getSubscription, requestPlan, withdrawPlanRequest } from '../api/subscription';
import {
  getForecast,
  asForecastSnapshot,
  getLoteForecast,
  reversePlace,
  searchPlaces,
} from '../api/pronostico';
import type {
  AlertInbox,
  AlertRule,
  AlertRuleInput,
  Lote,
  LoteInput,
  LotesSnapshot,
  PlanRequest,
  PlanRequestInput,
  Subscription,
  User,
} from '../api/types';
import {
  currentEndpoint,
  permission,
  pushSupported,
  requestPermission,
  subscribeBrowser,
  unsubscribeBrowser,
} from '../lib/push';
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

export type Preferences = Pick<User, 'notify_push' | 'notify_email'>;

/**
 * PATCH /api/auth/me/ for the alert switches: they move at once, since on the farm's signal
 * waiting for the server reads as a broken switch, and only the field that failed goes back.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: Partial<Preferences>) => updateAccount(changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me });
      const before = queryClient.getQueryData<User | null>(queryKeys.me);
      queryClient.setQueryData<User | null>(queryKeys.me, (me) =>
        me ? { ...me, ...changes } : me,
      );
      return { before };
    },
    onError: (_error, changes, context) => {
      const before = context?.before;
      if (!before) return;
      // Field by field: another switch saved meanwhile keeps its new value.
      const back = Object.fromEntries(
        Object.keys(changes).map((key) => [key, before[key as keyof Preferences]]),
      );
      queryClient.setQueryData<User | null>(queryKeys.me, (me) => (me ? { ...me, ...back } : me));
    },
    // Only the field this request changed: two answers can arrive out of order, and the later
    // one was built before the other change reached the server.
    onSuccess: (user: User, changes) => {
      const saved = Object.fromEntries(
        Object.keys(changes).map((key) => [key, user[key as keyof Preferences]]),
      );
      queryClient.setQueryData<User | null>(queryKeys.me, (me) => (me ? { ...me, ...saved } : me));
    },
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

/**
 * A new or moved lote has no forecast for a few seconds while the backend fetches it
 * (cuenta-planes-alertas S12): the API answers 404 until then.
 */
export const isForecastPending = (error: unknown) =>
  error instanceof ApiError && error.status === 404;

/** How the lote page waits for that first forecast: every 5 s, for about a minute. */
export const FORECAST_WAIT = { everyMs: 5_000, tries: 12 };

export const useLoteForecast = (id: number) =>
  useQuery({
    queryKey: queryKeys.loteForecast(id),
    queryFn: () => getLoteForecast(id),
    select: asForecastSnapshot,
    enabled: Number.isFinite(id),
    // Only with nothing to show yet: a cached forecast stays on screen as it always did.
    refetchInterval: ({ state }) =>
      state.data === undefined &&
      isForecastPending(state.error) &&
      state.errorUpdateCount < FORECAST_WAIT.tries
        ? FORECAST_WAIT.everyMs
        : false,
  });

/** Starts the wait for the first forecast over, after it gave up (see FORECAST_WAIT). */
export function useRetryLoteForecast(id: number) {
  const queryClient = useQueryClient();
  return () => queryClient.resetQueries({ queryKey: queryKeys.loteForecast(id), exact: true });
}

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

/** The account's alert rules (cuenta-planes-alertas S6), oldest first. */
export const useAlertRules = () =>
  useQuery({ queryKey: queryKeys.alertRules, queryFn: listAlertRules });

/** After a rule is added or removed: the list re-reads `paused_by_plan`, `me` the usage (S4). */
function useRefreshRules() {
  const queryClient = useQueryClient();
  return (update: (list: AlertRule[]) => AlertRule[]) => {
    queryClient.setQueryData<AlertRule[]>(queryKeys.alertRules, (list) =>
      list ? update(list) : list,
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.alertRules });
    void queryClient.invalidateQueries({ queryKey: queryKeys.me });
  };
}

export function useCreateAlertRule() {
  const refresh = useRefreshRules();
  return useMutation({
    mutationFn: (input: AlertRuleInput) => createAlertRule(input),
    onSuccess: (rule: AlertRule) => refresh((list) => [...list, rule]),
  });
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<AlertRuleInput> }) =>
      updateAlertRule(id, changes),
    onSuccess: (rule: AlertRule) =>
      queryClient.setQueryData<AlertRule[]>(queryKeys.alertRules, (list) =>
        list?.map((r) => (r.id === rule.id ? rule : r)),
      ),
  });
}

export function useDeleteAlertRule() {
  const refresh = useRefreshRules();
  return useMutation({
    mutationFn: (id: number) => deleteAlertRule(id),
    onSuccess: (_: void, id: number) => refresh((list) => list.filter((r) => r.id !== id)),
  });
}

/** The inbox (S7): the newest events and how many are unread. */
export const useAlertInbox = () =>
  useQuery({ queryKey: queryKeys.alertInbox, queryFn: getAlertInbox });

/** Marks these events read, or all of them when `ids` is left out. */
export function useMarkAlertsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => markAlertsRead(ids),
    onSuccess: (_: void, ids?: number[]) => {
      const now = new Date().toISOString();
      queryClient.setQueryData<AlertInbox>(queryKeys.alertInbox, (inbox) => {
        if (!inbox) return inbox;
        const results = inbox.results.map((e) =>
          e.read_at === null && (!ids || ids.includes(e.id)) ? { ...e, read_at: now } : e,
        );
        return { results, unread_count: results.filter((e) => e.read_at === null).length };
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.alertInbox });
    },
  });
}

/** Push in this browser (S7): whether it can, what the person allowed, and its subscription. */
export interface PushHere {
  supported: boolean;
  permission: NotificationPermission;
  endpoint: string | null;
}

export const usePushHere = () =>
  useQuery({
    queryKey: queryKeys.pushHere,
    queryFn: async (): Promise<PushHere> => ({
      supported: pushSupported(),
      permission: permission(),
      endpoint: pushSupported() ? await currentEndpoint() : null,
    }),
    // It asks the browser, not the network.
    networkMode: 'always',
  });

/**
 * Asks the browser's permission (call it from a tap), subscribes this browser and tells the
 * server. Resolves with the permission answer: anything but 'granted' subscribed nothing.
 */
export function useEnablePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<NotificationPermission> => {
      const answer = await requestPermission();
      if (answer !== 'granted') return answer;
      const subscription = await subscribeBrowser(await getPushKey());
      try {
        await savePushSubscription(subscription);
      } catch (error) {
        // The server does not know this browser (402, no signal): do not leave it half on.
        await unsubscribeBrowser().catch(() => undefined);
        throw error;
      }
      return answer;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.pushHere }),
  });
}

/**
 * Stops push in this browser and tells the server, best effort: once the browser unsubscribes,
 * a subscription the server still holds fails with 410 and the backend drops it.
 */
export async function forgetPushHere(): Promise<void> {
  const endpoint = await currentEndpoint().catch(() => null);
  if (!endpoint) return;
  await Promise.allSettled([deletePushSubscription(endpoint), unsubscribeBrowser()]);
}

export function useDisablePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: forgetPushHere,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.pushHere }),
  });
}

/**
 * Before a logout: the next person on a shared phone must not get this account's alerts. Never
 * blocks the logout: errors are swallowed and a slow network gets `ms` at most.
 */
export async function forgetPushBeforeLogout(ms = 3000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([forgetPushHere().catch(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** My subscription (cuenta-planes-alertas S14): plan, status, usage, request and history. */
export const useSubscription = () =>
  useQuery({ queryKey: queryKeys.subscription, queryFn: getSubscription });

/** After a request is made or withdrawn: show it at once, then re-read the account and plan. */
function useRefreshSubscription() {
  const queryClient = useQueryClient();
  return (pending: PlanRequest | null) => {
    queryClient.setQueryData<Subscription>(queryKeys.subscription, (sub) =>
      sub ? { ...sub, pending_request: pending } : sub,
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
    void queryClient.invalidateQueries({ queryKey: queryKeys.me });
  };
}

export function useRequestPlan() {
  const queryClient = useQueryClient();
  const refresh = useRefreshSubscription();
  return useMutation({
    mutationFn: (input: PlanRequestInput) => requestPlan(input),
    onSuccess: (request: PlanRequest) => refresh(request),
    // Refused (e.g. another phone asked first): re-read what the server holds.
    onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscription }),
  });
}

export function useWithdrawPlanRequest() {
  const refresh = useRefreshSubscription();
  return useMutation({
    mutationFn: withdrawPlanRequest,
    onSuccess: () => refresh(null),
  });
}
