import { http, HttpResponse, type HttpHandler } from 'msw';
import type {
  AccountRecord,
  AccountRow,
  ActionRow,
  BackofficeActionKind,
  BackofficeSummary,
  Page,
  PaymentRow,
  PendingPriceChange,
  Person,
  RecordAlertRule,
  RecordCourtesy,
  RecordLote,
  RecordPlanChange,
  RequestRow,
  SubscriptionRow,
} from '../api/backoffice';
import type {
  Plan,
  PlanChangeReason,
  PlanCode,
  ProviderSubscriptionStatus,
  User,
} from '../api/types';
import { tomorrowInBuenosAires } from '../pages/backoffice/format';

/** Like plans.refuse_free_empresa: a founder moves up to Empresa only by paying (promociones SF4). */
export function freeEmpresaRefusal(
  founder: boolean,
  from: PlanCode | undefined,
  to: PlanCode | undefined,
): string | null {
  return founder && to === 'empresa' && from !== 'empresa'
    ? 'Como founder, Empresa se paga con Mercado Pago: pagás solo la diferencia.'
    : null;
}

/**
 * In-memory backoffice API (pagos-backoffice S4, S7), mirroring backend/apps/backoffice. Every
 * route answers 403 to anyone but a super admin, like IsSuperuser.
 */
/** An account row as the mock keeps it; the API adds `paying` (cortesias L8). */
export type StoredAccount = Omit<AccountRow, 'paying'>;

export interface BackofficeDb {
  summary: BackofficeSummary;
  /** Newest sign-ups first, like the API. `paying` is worked out from the subscriptions. */
  accounts: StoredAccount[];
  /** Every request; the list shows the pending ones, oldest first. */
  requests: RequestRow[];
  /** Newest first. */
  actions: ActionRow[];
  payments: PaymentRow[];
  subscriptions: SubscriptionRow[];
  /** What a record shows beyond its list row (backoffice-superadmin S1), by account id. */
  records: Record<number, RecordExtras>;
  /** FounderProgram.next_number. */
  founderNext: number;
  /** Mercado Pago as the sync and the cancel see it (S4). */
  mercadoPago: {
    down: boolean;
    /** The status Mercado Pago reports by preapproval id; missing means unchanged. */
    remote: Record<string, ProviderSubscriptionStatus>;
  };
  /** Accounts a reset email went to: a second one inside the cooldown answers 429. */
  resetSent: number[];
  /** The pending scheduled price of each plan (avisos-cambios S4). */
  priceChanges: Partial<Record<PlanCode, PendingPriceChange>>;
}

export interface RecordExtras {
  plan_expires_at: string | null;
  is_active: boolean;
  plan_changes: RecordPlanChange[];
  lotes: RecordLote[];
  alert_rules: RecordAlertRule[];
  /** The active cortesía (cortesias S1); missing in older fixtures means none. */
  courtesy?: RecordCourtesy | null;
  /** Ended cortesías as Buenos Aires days `[start, end)`, for "1 año en 2 años" (L5). */
  pastCourtesies?: DaySpan[];
}

/** Buenos Aires days `[start, end)`, `YYYY-MM-DD`: its length is end − start. */
export interface DaySpan {
  start: string;
  end: string;
}

/** What the backoffice handlers need from the app's mock (src/mocks/handlers.ts). */
export interface BackofficeHost {
  user: User | null;
  plans: Plan[];
  nextId: number;
  backoffice: BackofficeDb;
  /** Mercado Pago configured on the server: the sync and the cancel answer 503 without it. */
  paymentsEnabled: boolean;
  /** Every request to /api/backoffice/ and /api/pagos/, with its query string and body. */
  sent: { method: string; path: string; body: unknown }[];
}

/** Django's CSRF check on unsafe methods, shared with the rest of the mock: a 403 or null. */
export type CsrfCheck = (request: Request) => Response | null;

export const NOT_SUPERUSER = 'Solo los super admins pueden usar el backoffice.';
export const SELF_REFUSED = 'No podés hacer eso con tu propia cuenta.';
export const NO_SUBSCRIPTION = 'La cuenta no tiene una suscripción con Mercado Pago.';
export const PROVIDER_DOWN = 'No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.';
const NOT_ENABLED = 'Los pagos todavía no están habilitados.';
const EMAIL_IN_USE = 'Ya hay una cuenta con ese email.';
// cortesias S1, S2, S4: the words of backoffice/views.py, serializers.py and accounts/plans.py.
export const USE_COURTESY = 'Para dar un plan pago sin cobrar, usá una cortesía.';
const COURTESY_SELF = 'No podés darte una cortesía a vos mismo.';
const NO_COURTESY = 'La cuenta no tiene una cortesía activa.';
const FOUNDER_HAS_PRODUCTOR = 'La cuenta es founder: ya tiene Productor sin vencimiento.';
const COURTESY_CAP = 20;
const COURTESY_CAP_REACHED = 'Ya hay 20 cortesías activas. Revocá alguna antes de dar otra.';
const COURTESY_MAX_DAYS = 365;
const COURTESY_WINDOW_DAYS = 730;
const YEAR_IN_TWO = 'Una cuenta suma como máximo un año de cortesía cada 2 años: ';
// cortesias S6: no free plan for a super admin or a blocked account.
const SUPERADMIN_NO_GRANTS = 'La cuenta es super admin: no recibe cortesías, pruebas ni founder.';
const ACCOUNT_BLOCKED = 'La cuenta está bloqueada.';
const REQUIRED = 'Este campo es requerido.';
const PAGE_SIZE = 50;
// cortesias L8: the words of AccountPlanView for a paying account.
const PAYING_PLAN =
  'La cuenta paga una suscripción: para bajarla, cancelá la suscripción desde su ficha (sigue con el plan hasta el fin del mes pagado); para subirla, la persona se suscribe al otro plan.';

const ana: Person = { id: 1, name: 'Ana Ferreyra', email: 'ana@lacampana.com.ar' };
const juan: Person = { id: 21, name: 'Juan Gómez', email: 'juan@elombu.com.ar' };
const marta: Person = { id: 22, name: 'Marta Ríos', email: 'marta@sancayetano.com.ar' };

export function demoBackoffice(): BackofficeDb {
  return {
    summary: {
      accounts: {
        total: 3,
        founders: 1,
        trial: 1,
        active: { basico: 1, productor: 0, empresa: 0 },
      },
      founders_left: 93,
      pending_requests: 1,
      new_accounts_last_30_days: 2,
      payments: {
        active_subscriptions: 1,
        monthly_ars: 14900,
        month_payments: 1,
        month_ars: 14900,
      },
    },
    accounts: [
      {
        ...marta,
        plan: { code: 'basico', name: 'Básico' },
        status: 'active',
        founder_number: null,
        lotes: 1,
        date_joined: '2026-11-12T13:00:00Z',
        last_login: null,
        is_superuser: false,
      },
      {
        ...juan,
        plan: { code: 'productor', name: 'Productor' },
        status: 'trial',
        founder_number: null,
        lotes: 4,
        date_joined: '2026-11-02T13:00:00Z',
        last_login: '2026-11-18T10:30:00Z',
        is_superuser: false,
      },
      {
        ...ana,
        plan: { code: 'productor', name: 'Productor' },
        status: 'founder',
        founder_number: 7,
        lotes: 3,
        date_joined: '2026-09-02T13:00:00Z',
        last_login: '2026-11-19T08:00:00Z',
        is_superuser: true,
      },
    ],
    requests: [
      {
        id: 31,
        kind: 'change',
        plan: { code: 'empresa', name: 'Empresa' },
        status: 'pending',
        created_at: '2026-11-15T13:00:00Z',
        user: { ...marta, plan: { code: 'basico', name: 'Básico' }, status: 'active' },
      },
    ],
    actions: [
      {
        id: 41,
        action: 'price_update',
        actor: ana,
        target_user: null,
        payload: {
          plan: 'productor',
          before: { price_ars_month: 13900, price_usd_month: 10 },
          after: { price_ars_month: 14900, price_usd_month: 10 },
        },
        at: '2026-11-17T12:00:00Z',
      },
    ],
    payments: [
      {
        id: 51,
        user: juan,
        provider: 'mercadopago',
        external_id: '1319000001',
        subscription: 61,
        amount: 14900,
        currency: 'ARS',
        status: 'approved',
        paid_at: '2026-11-03T14:00:00Z',
        created_at: '2026-11-03T14:00:00Z',
      },
    ],
    subscriptions: [
      {
        id: 61,
        user: juan,
        plan: { code: 'productor', name: 'Productor' },
        provider: 'mercadopago',
        external_id: '2c938084-mock',
        currency: 'ARS',
        amount: 14900,
        status: 'authorized',
        next_payment_at: '2026-12-03T14:00:00Z',
        ends_at: null,
        ended_at: null,
        created_at: '2026-11-03T13:50:00Z',
      },
    ],
    records: {
      [juan.id]: {
        plan_expires_at: '2026-12-02T13:00:00Z',
        is_active: true,
        plan_changes: [
          {
            id: 71,
            at: '2026-11-02T13:00:00Z',
            from_plan: null,
            to_plan: { code: 'productor', name: 'Productor' },
            reason: 'trial',
            by: null,
            note: '',
          },
        ],
        lotes: [
          { id: 81, name: 'La Loma', created_at: '2026-11-02T14:00:00Z' },
          { id: 82, name: 'El Bajo', created_at: '2026-11-04T14:00:00Z' },
        ],
        alert_rules: [
          { id: 91, variable: 'frost', name: 'Helada en el suelo', lote: 'La Loma', enabled: true },
        ],
      },
    },
    founderNext: 8,
    priceChanges: {},
    mercadoPago: { down: false, remote: {} },
    resetSent: [],
  };
}

/** DRF PageNumberPagination: 50 a page, 404 "Página inválida." past the end. */
function paginate<T>(rows: T[], url: URL): Page<T> | null {
  const page = Number(url.searchParams.get('page') ?? '1');
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (!Number.isInteger(page) || page < 1 || page > pages) return null;
  const link = (n: number) => {
    const next = new URL(url);
    next.searchParams.set('page', String(n));
    return next.toString();
  };
  return {
    count: rows.length,
    next: page < pages ? link(page + 1) : null,
    previous: page > 1 ? link(page - 1) : null,
    results: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}

const pageOr404 = <T>(rows: T[], url: URL) => {
  const page = paginate(rows, url);
  return page
    ? HttpResponse.json(page)
    : HttpResponse.json({ detail: 'Página inválida.' }, { status: 404 });
};

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const isPrice = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);

/**
 * Records the request, then answers 403 unless a super admin is signed in (IsSuperuser), and
 * checks CSRF on writes. Shared by every backoffice mock, reports included.
 */
export function backofficeGate(db: BackofficeHost, csrf: CsrfCheck) {
  return async function gate(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const body =
      request.method === 'GET'
        ? undefined
        : await request
            .clone()
            .json()
            .catch(() => undefined);
    db.sent.push({ method: request.method, path: url.pathname + url.search, body });
    if (!db.user) {
      return HttpResponse.json(
        { detail: 'Las credenciales de autenticación no se proveyeron.' },
        { status: 403 },
      );
    }
    if (!db.user.is_superuser) {
      return HttpResponse.json({ detail: NOT_SUPERUSER }, { status: 403 });
    }
    return request.method === 'GET' ? null : csrf(request);
  };
}

const membershipOf = (founder: number | null, expiresAt: string | null) =>
  founder !== null ? 'founder' : expiresAt ? 'trial' : 'active';

/** Buenos Aires is UTC−3 all year: the day of an instant there, as `YYYY-MM-DD`. */
const dayInBuenosAires = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const todayInBuenosAires = () => dayInBuenosAires(Date.now());
const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** `31/12/2026`, as Python's `strftime("%d/%m/%Y")`. */
const slashed = (day: string) => day.split('-').reverse().join('/');
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const overlap = (span: DaySpan, from: string, to: string) =>
  Math.max(daysBetween(span.start > from ? span.start : from, span.end < to ? span.end : to), 0);

/** Like plans._within_year_in_two: no 730-day window touching `candidate` sums over 365 days. */
function withinYearInTwo(past: DaySpan[], candidate: DaySpan): boolean {
  const spans = [...past, candidate];
  const starts = new Set([
    ...spans.map((s) => s.start),
    ...spans.map((s) => addDays(s.end, -COURTESY_WINDOW_DAYS)),
  ]);
  for (const from of starts) {
    const to = addDays(from, COURTESY_WINDOW_DAYS);
    if (overlap(candidate, from, to) === 0) continue;
    const total = spans.reduce((sum, span) => sum + overlap(span, from, to), 0);
    if (total > COURTESY_MAX_DAYS) return false;
  }
  return true;
}

/** Like plans._refuse_over_a_year_in_two: the refusal, or null when the end is allowed. */
function yearInTwoRefusal(past: DaySpan[], start: string, until: string): string | null {
  if (withinYearInTwo(past, { start, end: until })) return null;
  const today = todayInBuenosAires();
  let last = until;
  while (last > today && !withinYearInTwo(past, { start, end: last })) last = addDays(last, -1);
  if (last > today) return `${YEAR_IN_TWO}esta puede terminar como máximo el ${slashed(last)}.`;
  let day = addDays(today, 1);
  while (!withinYearInTwo(past, { start: day, end: addDays(day, 1) })) day = addDays(day, 1);
  return `${YEAR_IN_TWO}puede recibir otra desde el ${slashed(day)}.`;
}

export function createBackofficeHandlers(db: BackofficeHost, csrf: CsrfCheck): HttpHandler[] {
  const gate = backofficeGate(db, csrf);
  const actor = (): Person => ({ id: db.user!.id, name: db.user!.name, email: db.user!.email });
  const record = (
    action: BackofficeActionKind,
    target: Person | null,
    payload: ActionRow['payload'],
  ) =>
    db.backoffice.actions.unshift({
      id: db.nextId++,
      action,
      actor: actor(),
      target_user: target,
      payload,
      at: new Date().toISOString(),
    });
  const planRef = (code: PlanCode) => {
    const plan = db.plans.find((p) => p.code === code);
    return plan ? { code: plan.code, name: plan.name } : null;
  };

  const person = (row: StoredAccount): Person => ({ id: row.id, name: row.name, email: row.email });
  const extrasOf = (row: StoredAccount): RecordExtras =>
    (db.backoffice.records[row.id] ??= {
      plan_expires_at: null,
      is_active: true,
      plan_changes: [],
      lotes: [],
      alert_rules: [],
    });
  const recordOf = (row: StoredAccount): AccountRecord => {
    const extras = extrasOf(row);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      plan: row.plan,
      status: row.status,
      founder_number: row.founder_number,
      is_superuser: row.is_superuser,
      date_joined: row.date_joined,
      last_login: row.last_login,
      plan_expires_at: extras.plan_expires_at,
      is_active: extras.is_active,
      plan_changes: extras.plan_changes,
      subscriptions: db.backoffice.subscriptions
        .filter((sub) => sub.user.id === row.id)
        .map(({ user: _user, ...sub }) => sub),
      payments: db.backoffice.payments
        .filter((payment) => payment.user.id === row.id)
        .map(({ user: _user, ...payment }) => payment),
      lotes: extras.lotes,
      alert_rules: extras.alert_rules,
      courtesy: extras.courtesy ?? null,
      paying: pays(row),
    };
  };
  /** Like backoffice.views.is_paying: what refuse_if_paying(trial=True) refuses. */
  const pays = (row: StoredAccount) => payingRefusal(row, true) !== null;
  const rowOf = (row: StoredAccount): AccountRow => ({ ...row, paying: pays(row) });
  const findAccount = (id: unknown) => db.backoffice.accounts.find((a) => a.id === Number(id));
  const notFound = () => HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
  const refuse = (detail: string, status = 400) => HttpResponse.json({ detail }, { status });
  /** Like plans._switch with reason "staff": a move (or a trial ending) is recorded. */
  const switchToProductor = (row: StoredAccount) => {
    const extras = extrasOf(row);
    if (row.plan.code === 'productor' && extras.plan_expires_at === null) return;
    extras.plan_changes.unshift({
      id: db.nextId++,
      at: new Date().toISOString(),
      from_plan: row.plan,
      to_plan: { code: 'productor', name: 'Productor' },
      reason: 'staff',
      by: actor(),
      note: '',
    });
    row.plan = { code: 'productor', name: 'Productor' };
    extras.plan_expires_at = null;
    extras.courtesy = null; // plans._switch ends an active cortesía on any other move
  };
  /** Like plans._switch: a recorded move, by the super admin. */
  const moveTo = (row: StoredAccount, code: PlanCode, reason: PlanChangeReason, note = '') => {
    const to = planRef(code)!;
    extrasOf(row).plan_changes.unshift({
      id: db.nextId++,
      at: new Date().toISOString(),
      from_plan: row.plan,
      to_plan: to,
      reason,
      by: actor(),
      note,
    });
    row.plan = to;
  };
  const restatus = (row: StoredAccount) => {
    row.status = membershipOf(row.founder_number, extrasOf(row).plan_expires_at);
  };

  /** The one-click writes of a record (S2-S4), by the path they post to. */
  /**
   * Like refuse_if_paying in backoffice/views.py: a running subscription blocks a trial and a
   * founder grant; a cancelled one still inside its paid month blocks a trial only.
   */
  /** Like refuse_if_not_grantable (cortesias S6): never a super admin or a blocked account. */
  function grantableRefusal(row: StoredAccount): Response | null {
    if (row.is_superuser) return refuse(SUPERADMIN_NO_GRANTS);
    if (!extrasOf(row).is_active) return refuse(ACCOUNT_BLOCKED);
    return null;
  }

  function payingRefusal(row: StoredAccount, trial: boolean): Response | null {
    const open = db.backoffice.subscriptions.filter((s) => s.user.id === row.id && !s.ended_at);
    if (open.some((s) => s.status === 'authorized' || s.status === 'paused')) {
      return refuse('La cuenta tiene una suscripción paga: cancelala primero.');
    }
    const ending = open.find((s) => s.status === 'cancelled');
    if (trial && ending?.next_payment_at) {
      const date = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(ending.next_payment_at));
      return refuse(
        `La cuenta tiene días pagos hasta el ${date}: dale la prueba después de esa fecha.`,
      );
    }
    return null;
  }

  const actions: Record<string, (row: StoredAccount) => Response | null> = {
    bloquear: (row) => {
      if (row.id === db.user!.id) return refuse(SELF_REFUSED);
      const extras = extrasOf(row);
      if (extras.is_active) {
        extras.is_active = false;
        record('account_block', person(row), {});
      }
      return null;
    },
    desbloquear: (row) => {
      const extras = extrasOf(row);
      if (!extras.is_active) {
        extras.is_active = true;
        record('account_unblock', person(row), {});
      }
      return null;
    },
    'superadmin/dar': (row) => {
      if (!row.is_superuser) {
        row.is_superuser = true;
        record('superadmin_grant', person(row), {});
      }
      return null;
    },
    'superadmin/quitar': (row) => {
      if (row.id === db.user!.id) return refuse(SELF_REFUSED);
      if (row.is_superuser) {
        row.is_superuser = false;
        record('superadmin_revoke', person(row), {});
      }
      return null;
    },
    'restablecer-contrasena': (row) => {
      if (!extrasOf(row).is_active) return refuse('La cuenta está bloqueada.');
      if (db.backoffice.resetSent.includes(row.id)) {
        return refuse(
          'Ya le mandamos un mail hace menos de 10 minutos. Probá de nuevo más tarde.',
          429,
        );
      }
      db.backoffice.resetSent.push(row.id);
      record('password_reset', person(row), {});
      return null;
    },
    'founder/dar': (row) => {
      const ungrantable = grantableRefusal(row);
      if (ungrantable) return ungrantable;
      if (row.founder_number !== null) {
        return refuse(`La cuenta ya es founder (n.º ${row.founder_number}).`);
      }
      const paying = payingRefusal(row, false);
      if (paying) return paying;
      let number = db.backoffice.founderNext;
      while (db.backoffice.accounts.some((a) => a.founder_number === number)) number += 1;
      db.backoffice.founderNext = number + 1;
      const summary = db.backoffice.summary;
      summary.founders_left = Math.max(0, summary.founders_left - 1);
      const fromPlan = row.plan.code;
      row.founder_number = number;
      switchToProductor(row);
      record('founder_grant', person(row), { number, from_plan: fromPlan });
      return null;
    },
    'founder/quitar': (row) => {
      if (row.founder_number === null) return refuse('La cuenta no es founder.');
      const number = row.founder_number;
      row.founder_number = null;
      record('founder_revoke', person(row), { number });
      return null;
    },
    'suscripcion/sincronizar': (row) => {
      const [sub] = db.backoffice.subscriptions
        .filter((s) => s.user.id === row.id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      if (!sub) return refuse(NO_SUBSCRIPTION, 404);
      if (!db.paymentsEnabled) return refuse(NOT_ENABLED, 503);
      if (db.backoffice.mercadoPago.down) return refuse(PROVIDER_DOWN, 502);
      const before = sub.status;
      sub.status = db.backoffice.mercadoPago.remote[sub.external_id] ?? before;
      const payments = db.backoffice.payments.filter((p) => p.subscription === sub.id).length;
      record('subscription_sync', person(row), {
        subscription: sub.external_id,
        before,
        after: sub.status,
        payments,
      });
      return null;
    },
    'suscripcion/cancelar': (row) => {
      const sub = db.backoffice.subscriptions.find(
        (s) => s.user.id === row.id && ['authorized', 'paused'].includes(s.status) && !s.ended_at,
      );
      if (!sub) return refuse(NO_SUBSCRIPTION, 404);
      if (!db.paymentsEnabled) return refuse(NOT_ENABLED, 503);
      if (db.backoffice.mercadoPago.down) return refuse(PROVIDER_DOWN, 502);
      const before = sub.status;
      Object.assign(sub, { status: 'cancelled', ends_at: sub.next_payment_at });
      record('subscription_cancel', person(row), {
        subscription: sub.external_id,
        before,
        after: 'cancelled',
      });
      return null;
    },
  };

  return [
    http.get('*/api/backoffice/resumen/', async ({ request }) => {
      return (await gate(request)) ?? HttpResponse.json(db.backoffice.summary);
    }),

    http.get('*/api/backoffice/cuentas/', async ({ request }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const url = new URL(request.url);
      const q = fold(url.searchParams.get('q')?.trim() ?? '');
      const plan = url.searchParams.get('plan');
      const estado = url.searchParams.get('estado');
      if (estado && !['founder', 'trial', 'active'].includes(estado)) {
        return HttpResponse.json(
          { detail: 'Estado inválido: usá founder, trial o active.' },
          { status: 400 },
        );
      }
      const rows = db.backoffice.accounts.filter(
        (row) =>
          (!q || fold(row.name).includes(q) || fold(row.email).includes(q)) &&
          (!plan || row.plan.code === plan) &&
          (!estado || row.status === estado),
      );
      return pageOr404(rows.map(rowOf), url);
    }),

    http.post('*/api/backoffice/cuentas/:id/plan/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const row = db.backoffice.accounts.find((a) => a.id === Number(params.id));
      if (!row) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      const { plan, note = '' } = (await request.json()) as { plan: PlanCode; note?: string };
      const to = planRef(plan);
      if (!to) return HttpResponse.json({ detail: 'Ese plan no existe.' }, { status: 400 });
      if (pays(row)) return refuse(PAYING_PLAN);
      const free = freeEmpresaRefusal(row.founder_number !== null, row.plan.code, plan);
      if (free) return refuse(free);
      if (plan !== 'basico' && !(plan === 'productor' && row.founder_number !== null)) {
        return refuse(USE_COURTESY);
      }
      if (row.plan.code === plan && row.status !== 'trial') {
        return HttpResponse.json(
          { detail: `La cuenta ya está en el plan ${to.name}.` },
          { status: 400 },
        );
      }
      const from = row.plan.code;
      // change_plan ends a trial; a founder keeps the number.
      Object.assign(row, { plan: to, status: row.founder_number !== null ? 'founder' : 'active' });
      Object.assign(extrasOf(row), { plan_expires_at: null, courtesy: null });
      record(
        'plan_change',
        { id: row.id, name: row.name, email: row.email },
        {
          from,
          to: plan,
          note,
        },
      );
      return HttpResponse.json(rowOf(row));
    }),

    http.get('*/api/backoffice/pedidos/', async ({ request }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const pending = db.backoffice.requests
        .filter((r) => r.status === 'pending')
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return pageOr404(pending, new URL(request.url));
    }),

    http.post('*/api/backoffice/pedidos/:id/:verb/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const row = db.backoffice.requests.find((r) => r.id === Number(params.id));
      if (!row) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      if (row.status !== 'pending') {
        return HttpResponse.json({ detail: 'El pedido ya no está pendiente.' }, { status: 409 });
      }
      const describe = { request: row.id, kind: row.kind, plan: row.plan.code };
      const target = { id: row.user.id, name: row.user.name, email: row.user.email };
      if (params.verb === 'aplicar') {
        const owner = db.backoffice.accounts.find((a) => a.id === row.user.id);
        const free = freeEmpresaRefusal(
          (owner?.founder_number ?? null) !== null,
          owner?.plan.code ?? row.user.plan.code,
          row.plan.code,
        );
        if (free) return refuse(free);
        row.status = 'applied';
        record('request_apply', target, describe);
      } else {
        const body = (await request.json().catch(() => ({}))) as { note?: string };
        row.status = 'rejected';
        record('request_reject', target, { ...describe, note: body.note ?? '' });
      }
      return HttpResponse.json(row);
    }),

    http.get('*/api/backoffice/precios/', async ({ request }) => {
      return (
        (await gate(request)) ??
        HttpResponse.json(
          db.plans.map(({ code, name, price_ars_month, price_usd_month }) => ({
            code,
            name,
            price_ars_month,
            price_usd_month,
            pending_change: db.backoffice.priceChanges[code] ?? null,
          })),
        )
      );
    }),

    http.put('*/api/backoffice/precios/:code/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const index = db.plans.findIndex((p) => p.code === params.code);
      const plan = db.plans[index];
      if (!plan) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      const body = (await request.json()) as Record<string, unknown>;
      const errors: Record<string, string[]> = {};
      for (const field of ['price_ars_month', 'price_usd_month'] as const) {
        if (!(field in body)) errors[field] = ['Este campo es requerido.'];
        else if (!isPrice(body[field])) errors[field] = ['Ingrese un número entero válido.'];
      }
      if (Object.keys(errors).length) return HttpResponse.json(errors, { status: 400 });
      const before = {
        price_ars_month: plan.price_ars_month,
        price_usd_month: plan.price_usd_month,
      };
      const after = {
        price_ars_month: body.price_ars_month as number | null,
        price_usd_month: body.price_usd_month as number | null,
      };
      db.plans = db.plans.map((p, i) => (i === index ? { ...p, ...after } : p));
      record('price_update', null, { plan: plan.code, before, after });
      return HttpResponse.json({
        code: plan.code,
        name: plan.name,
        ...after,
        pending_change: db.backoffice.priceChanges[plan.code] ?? null,
      });
    }),

    /** Like PriceChangeView: 30 days ahead, one pending per plan, never Básico. */
    http.post('*/api/backoffice/precios/:code/cambio/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const plan = db.plans.find((p) => p.code === params.code);
      if (!plan) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      if (plan.code === 'basico') {
        return HttpResponse.json(
          { detail: 'El plan Básico es gratis: no se le programa un precio.' },
          { status: 400 },
        );
      }
      const body = (await request.json()) as Record<string, unknown>;
      const errors: Record<string, string[]> = {};
      // Like PriceChangeSerializer: both prices, whole numbers from 1 (avisos-cambios L8).
      for (const field of ['price_ars_month', 'price_usd_month'] as const) {
        const value = body[field];
        if (value === undefined) errors[field] = ['Este campo es requerido.'];
        else if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
          errors[field] = ['Asegúrese de que este valor sea mayor o igual a 1.'];
        }
      }
      const day = body.effective_on;
      const earliest = tomorrowInBuenosAires(Date.now() + 29 * 86_400_000);
      if (typeof day !== 'string' || !day) errors.effective_on = ['Este campo es requerido.'];
      else if (day < earliest) {
        errors.effective_on = ['La fecha tiene que ser al menos 30 días después de hoy.'];
      }
      if (Object.keys(errors).length) return HttpResponse.json(errors, { status: 400 });
      if (db.backoffice.priceChanges[plan.code]) {
        return HttpResponse.json(
          {
            detail:
              'Ese plan ya tiene un cambio de precio programado. Cancelalo antes de programar otro.',
          },
          { status: 409 },
        );
      }
      const reached = db.backoffice.subscriptions.filter(
        (row) =>
          row.plan.code === plan.code && (row.status === 'authorized' || row.status === 'paused'),
      ).length;
      const change = {
        price_ars_month: body.price_ars_month as number,
        price_usd_month: body.price_usd_month as number,
        effective_on: day as string,
        notices: reached,
        notices_sent: reached,
      };
      db.backoffice.priceChanges = { ...db.backoffice.priceChanges, [plan.code]: change };
      record('price_schedule', null, {
        plan: plan.code,
        price_ars_month: change.price_ars_month,
        price_usd_month: change.price_usd_month,
        effective_on: change.effective_on,
      });
      return HttpResponse.json(
        {
          code: plan.code,
          name: plan.name,
          price_ars_month: plan.price_ars_month,
          price_usd_month: plan.price_usd_month,
          pending_change: change,
        },
        { status: 201 },
      );
    }),

    http.delete('*/api/backoffice/precios/:code/cambio/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const plan = db.plans.find((p) => p.code === params.code);
      if (!plan) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      const change = db.backoffice.priceChanges[plan.code];
      if (!change) {
        return HttpResponse.json(
          { detail: 'Ese plan no tiene un cambio de precio programado.' },
          { status: 404 },
        );
      }
      const rest = { ...db.backoffice.priceChanges };
      delete rest[plan.code];
      db.backoffice.priceChanges = rest;
      record('price_unschedule', null, {
        plan: plan.code,
        price_ars_month: change.price_ars_month,
        price_usd_month: change.price_usd_month,
        effective_on: change.effective_on,
      });
      return HttpResponse.json({
        code: plan.code,
        name: plan.name,
        price_ars_month: plan.price_ars_month,
        price_usd_month: plan.price_usd_month,
        pending_change: null,
      });
    }),

    http.get('*/api/backoffice/registro/', async ({ request }) => {
      return (await gate(request)) ?? pageOr404(db.backoffice.actions, new URL(request.url));
    }),

    http.get('*/api/backoffice/pagos/', async ({ request }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const url = new URL(request.url);
      const tipo = url.searchParams.get('tipo') || 'pagos';
      if (tipo === 'pagos') return pageOr404(db.backoffice.payments, url);
      if (tipo === 'suscripciones') return pageOr404(db.backoffice.subscriptions, url);
      return HttpResponse.json(
        { detail: 'Tipo inválido: usá pagos o suscripciones.' },
        { status: 400 },
      );
    }),
    http.get('*/api/backoffice/cuentas/:id/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const row = findAccount(params.id);
      return row ? HttpResponse.json(recordOf(row)) : notFound();
    }),

    http.patch('*/api/backoffice/cuentas/:id/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const row = findAccount(params.id);
      if (!row) return notFound();
      const body = (await request.json()) as { name?: string; email?: string };
      const errors: Record<string, string[]> = {};
      const name = body.name?.trim();
      const email = body.email?.trim().toLowerCase();
      if (name !== undefined && !name) errors.name = ['Este campo no puede estar en blanco.'];
      if (email !== undefined) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          errors.email = ['Introduzca una dirección de correo electrónico válida.'];
        } else if (db.backoffice.accounts.some((a) => a.id !== row.id && a.email === email)) {
          errors.email = [EMAIL_IN_USE];
        }
      }
      if (Object.keys(errors).length) return HttpResponse.json(errors, { status: 400 });
      const before: Record<string, string> = {};
      const after: Record<string, string> = {};
      for (const [field, value] of [
        ['name', name],
        ['email', email],
      ] as const) {
        if (value !== undefined && value !== row[field]) {
          before[field] = row[field];
          after[field] = value;
          row[field] = value;
        }
      }
      if (Object.keys(after).length) record('account_update', person(row), { before, after });
      return HttpResponse.json(recordOf(row));
    }),

    http.post('*/api/backoffice/cuentas/:id/prueba/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const row = findAccount(params.id);
      if (!row) return notFound();
      const { hasta } = (await request.json().catch(() => ({}))) as { hasta?: string };
      if (!hasta || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        return HttpResponse.json({ hasta: ['Este campo es requerido.'] }, { status: 400 });
      }
      if (hasta <= todayInBuenosAires()) {
        return HttpResponse.json({ hasta: ['La fecha tiene que ser futura.'] }, { status: 400 });
      }
      const lastTrialDay = addDays(todayInBuenosAires(), COURTESY_MAX_DAYS);
      if (hasta > lastTrialDay) {
        return HttpResponse.json(
          {
            hasta: [
              `La prueba dura como máximo un año: elegí una fecha hasta el ${slashed(lastTrialDay)}.`,
            ],
          },
          { status: 400 },
        );
      }
      const ungrantable = grantableRefusal(row);
      if (ungrantable) return ungrantable;
      if (row.founder_number !== null) {
        return refuse('La cuenta es founder: ya tiene Productor sin vencimiento.');
      }
      const paying = payingRefusal(row, true);
      if (paying) return paying;
      const fromPlan = row.plan.code;
      switchToProductor(row);
      extrasOf(row).plan_expires_at = new Date(`${hasta}T23:59:59-03:00`).toISOString();
      restatus(row);
      record('trial_grant', person(row), { until: hasta, from_plan: fromPlan });
      return HttpResponse.json(recordOf(row));
    }),

    /** Like CourtesyView.post (cortesias S1): the same checks, in the same order. */
    http.post('*/api/backoffice/cuentas/:id/cortesia/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const row = findAccount(params.id);
      if (!row) return notFound();
      if (row.id === db.user!.id) return refuse(COURTESY_SELF);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const errors: Record<string, string[]> = {};
      const { plan, hasta, motivo } = body;
      if (plan === undefined || plan === null || plan === '') errors.plan = [REQUIRED];
      else if (plan !== 'productor' && plan !== 'empresa') {
        errors.plan = [`"${String(plan)}" no es una elección válida.`];
      }
      const today = todayInBuenosAires();
      const last = addDays(today, COURTESY_MAX_DAYS);
      if (hasta === undefined || hasta === null || hasta === '') errors.hasta = [REQUIRED];
      else if (typeof hasta !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        errors.hasta = [
          'Fecha con formato erróneo. Use uno de los siguientes formatos en su lugar: YYYY-MM-DD.',
        ];
      } else if (hasta <= today) errors.hasta = ['La fecha tiene que ser futura.'];
      else if (hasta > last) {
        errors.hasta = [
          `La cortesía dura como máximo un año: elegí una fecha hasta el ${slashed(last)}.`,
        ];
      }
      const reason = typeof motivo === 'string' ? motivo.trim() : '';
      if (motivo === undefined || motivo === null) errors.motivo = [REQUIRED];
      else if (!reason) errors.motivo = ['Este campo no puede estar en blanco.'];
      else if (reason.length > 200) {
        errors.motivo = ['Asegúrese de que este campo no tenga más de 200 caracteres.'];
      }
      if (Object.keys(errors).length) return HttpResponse.json(errors, { status: 400 });
      const code = plan as 'productor' | 'empresa';
      const until = hasta as string;
      const ungrantable = grantableRefusal(row);
      if (ungrantable) return ungrantable;
      if (row.founder_number !== null && code === 'productor') {
        return refuse(FOUNDER_HAS_PRODUCTOR);
      }
      const paying = payingRefusal(row, true);
      if (paying) return paying;
      const extras = extrasOf(row);
      const active = extras.courtesy ?? null;
      if (!active) {
        const count = Object.values(db.backoffice.records).filter((r) => r.courtesy).length;
        if (count >= COURTESY_CAP) return refuse(COURTESY_CAP_REACHED);
      }
      const start = active ? dayInBuenosAires(Date.parse(active.starts_at)) : today;
      const tooLong = yearInTwoRefusal(extras.pastCourtesies ?? [], start, until);
      if (tooLong) return refuse(tooLong);
      const fromPlan = row.plan.code;
      if (!active || fromPlan !== code) moveTo(row, code, 'courtesy', reason);
      const endsAt = new Date(`${until}T23:59:59-03:00`).toISOString();
      extras.plan_expires_at = endsAt;
      extras.courtesy = {
        plan: planRef(code)!,
        starts_at: active?.starts_at ?? new Date().toISOString(),
        ends_at: endsAt,
        reason,
        granted_by: active?.granted_by ?? actor(),
      };
      restatus(row);
      record('courtesy_grant', person(row), {
        plan: code,
        until,
        reason,
        from_plan: fromPlan,
      });
      return HttpResponse.json(recordOf(row));
    }),

    /** Like CourtesyView.delete (cortesias S2): back to the free plan now, without an email. */
    http.delete('*/api/backoffice/cuentas/:id/cortesia/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const row = findAccount(params.id);
      if (!row) return notFound();
      const extras = extrasOf(row);
      const active = extras.courtesy;
      if (!active) return refuse(NO_COURTESY, 404);
      const to: PlanCode = row.founder_number === null ? 'basico' : 'productor';
      moveTo(row, to, 'courtesy_ended');
      // A revoked cortesía counts up to its revoke (cortesias L5).
      extras.pastCourtesies = [
        ...(extras.pastCourtesies ?? []),
        { start: dayInBuenosAires(Date.parse(active.starts_at)), end: todayInBuenosAires() },
      ];
      Object.assign(extras, { plan_expires_at: null, courtesy: null });
      restatus(row);
      record('courtesy_revoke', person(row), {
        plan: active.plan.code,
        until: dayInBuenosAires(Date.parse(active.ends_at)),
        to_plan: to,
      });
      return HttpResponse.json(recordOf(row));
    }),

    ...Object.entries(actions).map(([path, run]) =>
      http.post(`*/api/backoffice/cuentas/:id/${path}/`, async ({ request, params }) => {
        const refused = await gate(request);
        if (refused) return refused;
        const row = findAccount(params.id);
        if (!row) return notFound();
        const answer = run(row);
        if (answer) return answer;
        restatus(row);
        return HttpResponse.json(recordOf(row));
      }),
    ),
  ];
}
