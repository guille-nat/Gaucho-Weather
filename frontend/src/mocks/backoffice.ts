import { http, HttpResponse, type HttpHandler } from 'msw';
import type {
  AccountRow,
  ActionRow,
  BackofficeActionKind,
  BackofficeSummary,
  Page,
  PaymentRow,
  Person,
  RequestRow,
  SubscriptionRow,
} from '../api/backoffice';
import type { Plan, PlanCode, User } from '../api/types';

/**
 * In-memory backoffice API (pagos-backoffice S4, S7), mirroring backend/apps/backoffice. Every
 * route answers 403 to anyone but a super admin, like IsSuperuser.
 */
export interface BackofficeDb {
  summary: BackofficeSummary;
  /** Newest sign-ups first, like the API. */
  accounts: AccountRow[];
  /** Every request; the list shows the pending ones, oldest first. */
  requests: RequestRow[];
  /** Newest first. */
  actions: ActionRow[];
  payments: PaymentRow[];
  subscriptions: SubscriptionRow[];
}

/** What the backoffice handlers need from the app's mock (src/mocks/handlers.ts). */
export interface BackofficeHost {
  user: User | null;
  plans: Plan[];
  nextId: number;
  backoffice: BackofficeDb;
  /** Every request to /api/backoffice/ and /api/pagos/, with its query string and body. */
  sent: { method: string; path: string; body: unknown }[];
}

/** Django's CSRF check on unsafe methods, shared with the rest of the mock: a 403 or null. */
export type CsrfCheck = (request: Request) => Response | null;

export const NOT_SUPERUSER = 'Solo los super admins pueden usar el backoffice.';
const PAGE_SIZE = 50;

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
      return pageOr404(rows, url);
    }),

    http.post('*/api/backoffice/cuentas/:id/plan/', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const row = db.backoffice.accounts.find((a) => a.id === Number(params.id));
      if (!row) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      const { plan, note = '' } = (await request.json()) as { plan: PlanCode; note?: string };
      const to = planRef(plan);
      if (!to) return HttpResponse.json({ detail: 'Ese plan no existe.' }, { status: 400 });
      if (row.plan.code === plan && row.status !== 'trial') {
        return HttpResponse.json(
          { detail: `La cuenta ya está en el plan ${to.name}.` },
          { status: 400 },
        );
      }
      const from = row.plan.code;
      // change_plan ends a trial; a founder keeps the number.
      Object.assign(row, { plan: to, status: row.founder_number !== null ? 'founder' : 'active' });
      record(
        'plan_change',
        { id: row.id, name: row.name, email: row.email },
        {
          from,
          to: plan,
          note,
        },
      );
      return HttpResponse.json(row);
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
      return HttpResponse.json({ code: plan.code, name: plan.name, ...after });
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
  ];
}
