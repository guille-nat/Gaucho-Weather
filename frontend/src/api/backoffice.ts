import { ApiError, apiFetch, isCsrfFailure } from './client';
import type {
  AlertVariable,
  PaymentStatus,
  PlanChangeReason,
  PlanCode,
  PlanRef,
  ProviderSubscriptionStatus,
} from './types';

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

/** A scheduled peso price (avisos-cambios S4): who it reaches and how many were emailed. */
export interface PendingPriceChange {
  price_ars_month: number;
  /** `YYYY-MM-DD`: new checkouts pay it from then; each subscription 30 days after its email. */
  effective_on: string;
  notices: number;
  notices_sent: number;
}

export interface PlanPrice {
  code: PlanCode;
  name: string;
  price_ars_month: number | null;
  price_usd_month: number | null;
  pending_change: PendingPriceChange | null;
}

export type PriceInput = Pick<PlanPrice, 'price_ars_month' | 'price_usd_month'>;

export type BackofficeActionKind =
  | 'plan_change'
  | 'request_apply'
  | 'request_reject'
  | 'price_update'
  // avisos-cambios S1
  | 'price_schedule'
  | 'price_unschedule'
  // backoffice-superadmin S1-S4, S8
  | 'account_update'
  | 'account_block'
  | 'account_unblock'
  | 'superadmin_grant'
  | 'superadmin_revoke'
  | 'password_reset'
  | 'trial_grant'
  | 'founder_grant'
  | 'founder_revoke'
  | 'subscription_sync'
  | 'subscription_cancel'
  | 'export'
  // cortesias S1, S2
  | 'courtesy_grant'
  | 'courtesy_revoke';

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

/** `POST precios/{code}/cambio/`: at least 30 days ahead; emails the subscribers it reaches. */
export const schedulePriceChange = (
  code: PlanCode,
  input: { price_ars_month: number; effective_on: string },
) => backoffice<PlanPrice>(`precios/${code}/cambio/`, { method: 'POST', body: input });

/** `DELETE precios/{code}/cambio/`: drops the pending change; sends no email. */
export const cancelPriceChange = (code: PlanCode) =>
  backoffice<PlanPrice>(`precios/${code}/cambio/`, { method: 'DELETE' });

export const listActions = (page: number) =>
  backoffice<Page<ActionRow>>(`registro/${query({ page })}`);

export const listPayments = (page: number) =>
  backoffice<Page<PaymentRow>>(`pagos/${query({ tipo: 'pagos', page })}`);

export const listSubscriptions = (page: number) =>
  backoffice<Page<SubscriptionRow>>(`pagos/${query({ tipo: 'suscripciones', page })}`);

// --- backoffice-superadmin S1-S4: the account record --------------------------------------

export interface RecordPlanChange {
  id: number;
  at: string;
  /** Null at sign-up. */
  from_plan: PlanRef | null;
  to_plan: PlanRef;
  reason: PlanChangeReason;
  /** Who made a staff change; null for the system (sign-up, payments, the trial's end). */
  by: Person | null;
  note: string;
}

export type RecordSubscription = Omit<SubscriptionRow, 'user'>;
export type RecordPayment = Omit<PaymentRow, 'user'>;

export interface RecordLote {
  id: number;
  name: string;
  created_at: string;
}

export interface RecordAlertRule {
  id: number;
  variable: AlertVariable;
  /** The variable in words, e.g. "Helada en el suelo". */
  name: string;
  lote: string;
  enabled: boolean;
}

/** `GET cuentas/{id}/`: everything about one account. Every write below answers it again. */
export interface AccountRecord extends Person {
  plan: PlanRef;
  status: MembershipStatus;
  founder_number: number | null;
  plan_expires_at: string | null;
  /** False: blocked, cannot log in. */
  is_active: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  /** Newest first, like every list below. */
  plan_changes: RecordPlanChange[];
  subscriptions: RecordSubscription[];
  payments: RecordPayment[];
  lotes: RecordLote[];
  alert_rules: RecordAlertRule[];
  /** The active cortesía, or null (cortesias S5). */
  courtesy: RecordCourtesy | null;
}

/** A paid plan for free until `ends_at`, the end of a day in Buenos Aires (cortesias S1). */
export interface RecordCourtesy {
  plan: PlanRef;
  starts_at: string;
  ends_at: string;
  reason: string;
  /** Who gave it first; null once that account is deleted. */
  granted_by: Person | null;
}

/** The paid plans a cortesía gives. */
export type CourtesyPlan = Exclude<PlanCode, 'basico'>;

export interface CourtesyInput {
  plan: CourtesyPlan;
  /** `YYYY-MM-DD`, after today and at most a year ahead in Buenos Aires. */
  hasta: string;
  /** Up to 200 characters. */
  motivo: string;
}

export type AccountEdit = Partial<Pick<AccountRecord, 'name' | 'email'>>;

/** The one-click writes on a record, by the path they post to. */
export type AccountActionPath =
  | 'bloquear'
  | 'desbloquear'
  | 'superadmin/dar'
  | 'superadmin/quitar'
  | 'restablecer-contrasena'
  | 'founder/dar'
  | 'founder/quitar'
  | 'suscripcion/sincronizar'
  | 'suscripcion/cancelar';

export const getAccount = (id: number) => backoffice<AccountRecord>(`cuentas/${id}/`);

/** 400 with `email: ['Ya hay una cuenta con ese email.']` when another account has it. */
export const updateAccount = (id: number, input: AccountEdit) =>
  backoffice<AccountRecord>(`cuentas/${id}/`, { method: 'PATCH', body: input });

/**
 * 400 `{detail}` for what the rules refuse (yourself, a blocked account, already a founder);
 * 404 with no subscription, 502 when Mercado Pago fails, 503 when payments are off.
 */
export const accountAction = (id: number, path: AccountActionPath) =>
  backoffice<AccountRecord>(`cuentas/${id}/${path}/`, { method: 'POST' });

/** `hasta` is a calendar date, `YYYY-MM-DD`, after today in Buenos Aires. */
export const grantTrial = (id: number, hasta: string) =>
  backoffice<AccountRecord>(`cuentas/${id}/prueba/`, { method: 'POST', body: { hasta } });

/**
 * `POST cuentas/{id}/cortesia/`: gives the cortesía, or changes the active one's plan or date.
 * 400 with field errors (`plan`, `hasta`, `motivo`), or `{detail}` for yourself, a founder asking
 * for Productor, a paying account, the cap of 20 and a date past a year from the first grant.
 */
export const grantCourtesy = (id: number, input: CourtesyInput) =>
  backoffice<AccountRecord>(`cuentas/${id}/cortesia/`, { method: 'POST', body: input });

/** `DELETE cuentas/{id}/cortesia/`: back to the free plan now; 404 without an active one. */
export const revokeCourtesy = (id: number) =>
  backoffice<AccountRecord>(`cuentas/${id}/cortesia/`, { method: 'DELETE' });
