import { ApiError, apiFetch, isCsrfFailure } from './client';
import type { PaymentStatus, PlanCode, PlanRef, ProviderSubscriptionStatus } from './types';

/**
 * The backoffice API for super admins (pagos-backoffice S4, S7). Field names follow
 * backend/apps/backoffice/serializers.py.
 */

export type MembershipStatus = 'founder' | 'trial' | 'active';

/** DRF PageNumberPagination, 50 rows a page. */
export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Person {
  id: number;
  name: string;
  email: string;
}

export interface BackofficeSummary {
  accounts: {
    total: number;
    founders: number;
    trial: number;
    /** Accounts on a plan with no trial and no founder number, by plan code. */
    active: Partial<Record<PlanCode, number>>;
  };
  founders_left: number;
  pending_requests: number;
  new_accounts_last_30_days: number;
  /** Pesos only (S7). */
  payments: {
    active_subscriptions: number;
    monthly_ars: number;
    month_payments: number;
    month_ars: number;
  };
}

export interface AccountRow extends Person {
  plan: PlanRef;
  status: MembershipStatus;
  founder_number: number | null;
  lotes: number;
  date_joined: string;
  last_login: string | null;
  is_superuser: boolean;
}

export interface AccountFilters {
  q: string;
  plan: PlanCode | '';
  estado: MembershipStatus | '';
  page: number;
}

export interface RequestRow {
  id: number;
  kind: 'change' | 'cancel';
  plan: PlanRef;
  status: 'pending' | 'applied' | 'rejected' | 'withdrawn';
  created_at: string;
  user: Person & { plan: PlanRef; status: MembershipStatus };
}

export interface PlanPrice {
  code: PlanCode;
  name: string;
  price_ars_month: number | null;
  price_usd_month: number | null;
}

export type PriceInput = Pick<PlanPrice, 'price_ars_month' | 'price_usd_month'>;

export type BackofficeActionKind =
  'plan_change' | 'request_apply' | 'request_reject' | 'price_update';

export interface ActionRow {
  id: number;
  action: BackofficeActionKind;
  actor: Person | null;
  target_user: Person | null;
  payload: Record<string, unknown>;
  at: string;
}

export interface PaymentRow {
  id: number;
  user: Person;
  provider: string;
  external_id: string;
  subscription: number | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
}

export interface SubscriptionRow {
  id: number;
  user: Person;
  plan: PlanRef;
  provider: string;
  external_id: string;
  currency: string;
  amount: number;
  status: ProviderSubscriptionStatus;
  next_payment_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export type PaymentsKind = 'pagos' | 'suscripciones';

/**
 * A 403 here means "not a super admin", not "signed out". The query client ends the session on a
 * non-CSRF 403 (query/client.ts), so it is raised as this error instead: the page re-reads `me`
 * and leaves, and the session stays.
 */
export class BackofficeForbidden extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackofficeForbidden';
  }
}

async function backoffice<T>(path: string, options?: Parameters<typeof apiFetch>[1]): Promise<T> {
  try {
    return await apiFetch<T>(`/api/backoffice/${path}`, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && !isCsrfFailure(error)) {
      throw new BackofficeForbidden(error.message);
    }
    throw error;
  }
}

function query(params: Record<string, string | number>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && !(key === 'page' && value === 1)) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const getSummary = () => backoffice<BackofficeSummary>('resumen/');

export const listAccounts = (filters: AccountFilters) =>
  backoffice<Page<AccountRow>>(`cuentas/${query({ ...filters, q: filters.q.trim() })}`);

/** 400 `{detail}` when the account is already on that plan or the plan does not exist. */
export const changeAccountPlan = (id: number, plan: PlanCode, note: string) =>
  backoffice<AccountRow>(`cuentas/${id}/plan/`, { method: 'POST', body: { plan, note } });

export const listRequests = (page: number) =>
  backoffice<Page<RequestRow>>(`pedidos/${query({ page })}`);

/** 409 `{detail}` when the request is no longer pending. */
export const applyRequest = (id: number) =>
  backoffice<RequestRow>(`pedidos/${id}/aplicar/`, { method: 'POST' });

export const rejectRequest = (id: number, note: string) =>
  backoffice<RequestRow>(`pedidos/${id}/rechazar/`, { method: 'POST', body: { note } });

export const listPrices = () => backoffice<PlanPrice[]>('precios/');

/** Both prices at once; null is "Precio a confirmar", 0 is free. 400 names the bad field. */
export const updatePrice = (code: PlanCode, input: PriceInput) =>
  backoffice<PlanPrice>(`precios/${code}/`, { method: 'PUT', body: input });

export const listActions = (page: number) =>
  backoffice<Page<ActionRow>>(`registro/${query({ page })}`);

export const listPayments = (page: number) =>
  backoffice<Page<PaymentRow>>(`pagos/${query({ tipo: 'pagos', page })}`);

export const listSubscriptions = (page: number) =>
  backoffice<Page<SubscriptionRow>>(`pagos/${query({ tipo: 'suscripciones', page })}`);
