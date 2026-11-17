import { http, HttpResponse, type HttpHandler } from 'msw';
import type { AccountChanges } from '../api/account';
import { ALERT_VARIABLES, COMPARATOR_WORDS, describeRule } from '../api/alerts';
import { CROPS, MAX_PLANTINGS } from '../api/types';
import type {
  AlertComparator,
  AlertEvent,
  AlertRule,
  AlertRuleInput,
  AlertVariable,
  Forecast,
  Lote,
  LoteHistory,
  LoteInput,
  Plan,
  Planting,
  PlantingInput,
  PlanChange,
  PlanRequest,
  PlanRequestInput,
  PublicForecast,
  PushSubscriptionInput,
  Subscription,
  User,
} from '../api/types';
import { account, demoPlans } from './fixtures';
import { demoForecast, demoPlaces, demoPublicForecast } from './forecast';
import { checkHistoryRange, demoLoteHistory, localToday } from './history';

/**
 * In-memory implementation of the S8 API contract (odd/tasks/phase-1-foundation.md).
 * Used by the tests and by `pnpm dev:mock`; it is not the backend.
 */
export interface MockDb {
  user: User | null;
  accounts: { email: string; password: string; user: User }[];
  lotes: Lote[];
  nextId: number;
  csrfToken: string;
  /** Every unsafe request the mock received, with the CSRF header it carried. */
  unsafeRequests: { method: string; path: string; csrf: string | null }[];
  /** The public forecast for some coordinates (S10); the default names the nearest town. */
  publicForecast: (lat: number, lon: number) => PublicForecast;
  /** Coordinates of every public forecast asked for, in order. */
  forecastRequests: { lat: number; lon: number }[];
  /** Per-lote forecasts (S5); a lote missing here has none archived yet (404). */
  loteForecasts: Record<number, Forecast>;
  /** GET /api/planes/ (cuenta-planes-alertas S1, S8). */
  plans: Plan[];
  founders: { limit: number; remaining: number };
  trialDays: number;
  /** Emails a password reset was asked for, in order (S5). */
  resetRequests: string[];
  /** Valid reset links as `uid/token` → the account's email; a link works once. */
  resetLinks: Record<string, string>;
  /** History of a lote for a range the API accepts (cuenta-planes-alertas S9, S10). */
  loteHistory: (loteId: number, from: string, to: string) => LoteHistory;
  /** Every history asked for, with its raw `desde`/`hasta`, in order. */
  historyRequests: { id: number; desde: string | null; hasta: string | null }[];
  /** The account's alert rules (cuenta-planes-alertas S6), oldest first like the API. */
  alertRules: AlertRule[];
  /** The inbox (S7), newest first. */
  alertEvents: AlertEvent[];
  /** Browsers subscribed to push for this account (S7). */
  pushSubscriptions: PushSubscriptionInput[];
  /** The VAPID public key; null answers 503 like a server without VAPID settings. */
  pushPublicKey: string | null;
  /** The account's pending plan request (cuenta-planes-alertas S14). */
  planRequest: PlanRequest | null;
  /** Plan changes, newest first; undefined derives the sign-up from `user` (see subscriptionOf). */
  planHistory?: PlanChange[];
}

export const OUTSIDE_ARGENTINA = 'Por ahora solo cubrimos Argentina.';
export const NO_LOTE_FORECAST = 'Todavía no hay pronóstico para este lote.';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** The demo town closest to a point, within ~30 km. */
function nearestPlace(lat: number, lon: number) {
  let best: (typeof demoPlaces)[number] | null = null;
  let bestDistance = 0.3;
  for (const place of demoPlaces) {
    const distance = Math.hypot(place.lat - lat, place.lon - lon);
    if (distance < bestDistance) [best, bestDistance] = [place, distance];
  }
  return best ? { name: best.name, region: best.region } : null;
}

const insideArgentina = (lat: number, lon: number) =>
  lat >= -56 && lat <= -21 && lon >= -74 && lon <= -53;

/** A lote's forecast as the backend would give it; Lote 4 has a cold, calm night ahead. */
export function demoLoteForecasts(lotes: Lote[]): Record<number, Forecast> {
  const result: Record<number, Forecast> = {};
  for (const lote of lotes) {
    if (!lote.summary) continue;
    const forecast = demoForecast('sol');
    if (lote.id === 4) {
      forecast.decisions.frost_tonight = {
        level: 'caution',
        min_2m_c: 3,
        ground_estimate_c: -0.6,
        models_agreeing: '1 de 3 modelos',
        reason:
          'Noche despejada y calma: en el suelo puede bajar a −0,6 °C. 1 de 3 modelos da helada.',
      };
    }
    result[lote.id] = forecast;
  }
  return result;
}

export function createMockDb(partial: Partial<MockDb> = {}): MockDb {
  return {
    user: null,
    accounts: [],
    lotes: [],
    nextId: 100,
    csrfToken: 'mock-csrf-token',
    unsafeRequests: [],
    publicForecast: (lat, lon) => demoPublicForecast('sol', nearestPlace(lat, lon)),
    forecastRequests: [],
    loteForecasts: demoLoteForecasts(partial.lotes ?? []),
    plans: demoPlans,
    founders: { limit: 100, remaining: 93 },
    trialDays: 30,
    resetRequests: [],
    resetLinks: {},
    loteHistory: (_id, from, to) => demoLoteHistory(from, to),
    historyRequests: [],
    alertRules: [],
    alertEvents: [],
    pushSubscriptions: [],
    pushPublicKey:
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    planRequest: null,
    ...partial,
  };
}

/** The account as the backend serialises it, with its usage counted from the mock's lotes. */
const withUsage = (user: User, db: MockDb): User => ({
  ...user,
  usage: { lotes: db.lotes.length, alert_rules: db.alertRules.length },
});

/** GET /api/auth/suscripcion/ (S14), derived from the account like the backend does. */
function subscriptionOf(user: User, db: MockDb): Subscription {
  const plan = user.plan ?? db.plans.find((p) => p.code === 'basico')!;
  const status =
    user.founder_number != null ? 'founder' : user.plan_expires_at ? 'trial' : 'active';
  const signUp: PlanChange = {
    at: '2026-10-01T12:00:00Z',
    from_plan: null,
    to_plan: { code: 'productor', name: 'Productor' },
    reason: status === 'active' ? 'trial' : status,
  };
  return {
    plan,
    status,
    founder_number: user.founder_number ?? null,
    trial_ends_at: user.plan_expires_at ?? null,
    usage: { lotes: db.lotes.length, alert_rules: db.alertRules.length },
    pending_request: db.planRequest,
    history: db.planHistory ?? [signUp],
  };
}

/** Like the backend's request validation: the reason a plan request cannot be made, if any. */
function planRequestError(input: PlanRequestInput, user: User, db: MockDb): string | null {
  const code = input.kind === 'cancel' ? 'basico' : input.plan;
  const plan = db.plans.find((p) => p.code === code);
  if (!plan) return 'Ese plan no existe.';
  // On a trial, asking for the same plan means keeping it after the trial (as the backend).
  const onTrial = Boolean(user.plan_expires_at) && user.founder_number == null;
  if (user.plan?.code === plan.code && !onTrial) return `Ya estás en el plan ${plan.name}.`;
  if (db.planRequest) return 'Ya tenés un pedido pendiente.';
  return null;
}

/** Like plans.start_membership: a founder slot while any is left, else the Productor trial. */
function signUp(db: MockDb, identity: Pick<User, 'id' | 'email' | 'name'>): User {
  if (db.founders.remaining > 0) {
    const number = db.founders.limit - db.founders.remaining + 1;
    db.founders = { ...db.founders, remaining: db.founders.remaining - 1 };
    return account({ ...identity, founder_number: number });
  }
  const expires = new Date(Date.now() + db.trialDays * 86_400_000).toISOString();
  return account({ ...identity, plan_expires_at: expires });
}

const wrongPassword = (field: string) =>
  HttpResponse.json({ [field]: ['La contraseña no es correcta.'] }, { status: 400 });

const shortPassword = (field = 'new_password') =>
  HttpResponse.json(
    { [field]: ['Esta contraseña es demasiado corta. Debe contener al menos 8 caracteres.'] },
    { status: 400 },
  );

const forbidden = () =>
  HttpResponse.json(
    { detail: 'Las credenciales de autenticación no se proveyeron.' },
    { status: 403 },
  );

function csrfFailure(request: Request, db: MockDb) {
  const header = request.headers.get('X-CSRFToken');
  db.unsafeRequests.push({
    method: request.method,
    path: new URL(request.url).pathname,
    csrf: header,
  });
  // The server's own record of the token, like Django's: a stale cookie does not pass.
  if (!header || header !== db.csrfToken) {
    return HttpResponse.json({ detail: CSRF_FAILED }, { status: 403 });
  }
  return null;
}

export const CSRF_FAILED = 'Token CSRF ausente o inválido. Recargue la página e intente de nuevo.';

/** Django rotates the CSRF token when a session starts. */
function rotateCsrf(db: MockDb) {
  db.csrfToken = `${db.csrfToken.split('~')[0]}~${Math.random().toString(36).slice(2, 8)}`;
  document.cookie = `csrftoken=${db.csrfToken}; path=/`;
}

/** DRF's nested shape: one object per item, `{}` for the valid ones (cultivos-por-lote). */
function validatePlantings(value: unknown): unknown[] | string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return ['Se esperaba una lista de ítems.'];
  if (value.length > MAX_PLANTINGS) return ['Hasta 8 cultivos por lote.'];
  const items = value.map((item: Partial<PlantingInput> | null) => {
    const errors: Record<string, string[]> = {};
    const crop = item?.crop;
    if (!crop) errors.crop = ['Este campo es requerido.'];
    else if (!(CROPS as readonly string[]).includes(crop))
      errors.crop = [`"${crop}" no es una elección válida.`];
    const area = item?.area_ha;
    if (area !== undefined && area !== null && !(Number(area) > 0))
      errors.area_ha = ['Tiene que ser mayor que 0.'];
    return errors;
  });
  return items.some((errors) => Object.keys(errors).length) ? items : null;
}

function validateLote(body: Partial<LoteInput>, partial: boolean) {
  const errors: Record<string, unknown> = {};
  const plantings = validatePlantings(body.plantings);
  if (plantings) errors.plantings = plantings;
  if (!partial || body.name !== undefined) {
    if (!body.name || !String(body.name).trim()) errors.name = ['Este campo es requerido.'];
  }
  if (!partial || body.latitude !== undefined) {
    const lat = Number(body.latitude);
    if (body.latitude === undefined || body.latitude === null || Number.isNaN(lat)) {
      errors.latitude = ['Este campo es requerido.'];
    } else if (lat < -56 || lat > -21) {
      errors.latitude = ['Fuera del rango permitido.'];
    }
  }
  if (!partial || body.longitude !== undefined) {
    const lon = Number(body.longitude);
    if (body.longitude === undefined || body.longitude === null || Number.isNaN(lon)) {
      errors.longitude = ['Este campo es requerido.'];
    } else if (lon < -74 || lon > -53) {
      errors.longitude = ['Fuera del rango permitido.'];
    }
  }
  return errors;
}

type LoteWrite = Omit<LoteInput, 'plantings'> & { plantings?: PlantingInput[] };

/** A written list replaces the old one with fresh ids; no list keeps what the lote had. */
function toPlantings(db: MockDb, input: PlantingInput[] | undefined, previous?: Lote): Planting[] {
  if (input === undefined) return previous?.plantings ?? [];
  return input.map((item) => ({
    id: db.nextId++,
    crop: item.crop,
    area_ha:
      item.area_ha === null || item.area_ha === undefined ? null : Number(item.area_ha).toFixed(2),
    sowing_date: item.sowing_date ?? null,
  }));
}

function toLote(db: MockDb, id: number, body: LoteWrite, previous?: Lote): Lote {
  const now = new Date().toISOString();
  return {
    id,
    name: body.name,
    establishment: body.establishment ?? '',
    locality: body.locality ?? '',
    latitude: Number(body.latitude.toFixed(6)),
    longitude: Number(body.longitude.toFixed(6)),
    plantings: toPlantings(db, body.plantings, previous),
    area_ha:
      body.area_ha === null || body.area_ha === undefined ? null : Number(body.area_ha.toFixed(2)),
    boundary: body.boundary === undefined ? (previous?.boundary ?? null) : body.boundary,
    summary: previous?.summary ?? null,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
}

const byName = (a: Lote, b: Lote) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Like rules.validation_errors: field → its first problem, in the backend's Spanish. */
function ruleErrors(rule: AlertRuleInput, db: MockDb): Record<string, string[]> {
  if (!db.lotes.some((l) => l.id === rule.lote)) return { lote: ['Elegí uno de tus lotes.'] };
  const spec = ALERT_VARIABLES[rule.variable];
  if (!spec) return { variable: [`"${rule.variable}" no es una elección válida.`] };
  const { comparator, threshold } = rule;
  if (rule.variable === 'spray_window') {
    if (threshold !== null) return { threshold: ['La ventana de pulverización no lleva valor.'] };
    if (comparator !== null)
      return { comparator: ['La ventana de pulverización no lleva comparación.'] };
    return {};
  }
  const [low, high] = RULE_RANGES[rule.variable];
  const errors: Record<string, string[]> = {};
  if (comparator === null) errors.comparator = ['Elegí cómo comparar.'];
  else if (!spec.comparators.includes(comparator)) {
    const words = spec.comparators.map((c) => `«${COMPARATOR_WORDS[c]}»`).join(' o ');
    errors.comparator = [`Para ${RULE_NOUNS[rule.variable]} usá ${words}.`];
  }
  if (threshold === null) errors.threshold = ['Poné un valor.'];
  else if (threshold < low || threshold > high) {
    errors.threshold = [`Usá un valor entre ${low} y ${high} ${spec.unit}.`];
  }
  return errors;
}

// Mirrors backend/apps/alerts/rules.py SPECS (low, high); keep both in step.
const RULE_RANGES: Record<Exclude<AlertVariable, 'spray_window'>, [number, number]> = {
  frost: [-15, 10],
  temp_min: [-30, 50],
  temp_max: [-30, 50],
  rain: [0, 500],
  wind: [0, 200],
};

const RULE_NOUNS: Record<Exclude<AlertVariable, 'spray_window'>, string> = {
  frost: 'helada',
  temp_min: 'temperatura',
  temp_max: 'temperatura',
  rain: 'lluvia',
  wind: 'viento',
};

/** A rule as the API serialises it: rules beyond the plan's cap pause (S4). */
function serializeRules(db: MockDb): AlertRule[] {
  const cap = db.user?.plan?.max_alert_rules ?? null;
  return db.alertRules.map((rule, index) => ({
    ...rule,
    lote_name: db.lotes.find((l) => l.id === rule.lote)?.name ?? rule.lote_name,
    paused_by_plan: cap !== null && index >= cap,
  }));
}

function toRule(id: number, input: AlertRuleInput, db: MockDb, previous?: AlertRule): AlertRule {
  const loteName = db.lotes.find((l) => l.id === input.lote)?.name ?? '';
  const comparator: AlertComparator | null = input.comparator ?? null;
  const threshold = input.threshold ?? null;
  return {
    id,
    lote: input.lote,
    lote_name: loteName,
    variable: input.variable,
    comparator,
    threshold,
    enabled: input.enabled ?? previous?.enabled ?? true,
    paused_by_plan: false,
    description: describeRule(input.variable, comparator, threshold, loteName),
    created_at: previous?.created_at ?? new Date().toISOString(),
  };
}

export function createHandlers(db: MockDb): HttpHandler[] {
  return [
    http.get('*/api/health/', () => HttpResponse.json({ status: 'ok' })),

    http.get('*/api/auth/csrf/', () => {
      document.cookie = `csrftoken=${db.csrfToken}; path=/`;
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('*/api/auth/me/', () =>
      db.user ? HttpResponse.json(withUsage(db.user, db)) : forbidden(),
    ),

    http.patch('*/api/auth/me/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const body = (await request.json()) as AccountChanges;
      const entry = db.accounts.find((a) => a.user.id === db.user?.id);
      const email = body.email?.trim().toLowerCase();
      if (email && email !== db.user.email) {
        if (!body.current_password) {
          return HttpResponse.json(
            { current_password: ['Para cambiar el email confirmá tu contraseña.'] },
            { status: 400 },
          );
        }
        if (body.current_password !== entry?.password) return wrongPassword('current_password');
        if (db.accounts.some((a) => a.email === email)) {
          return HttpResponse.json(
            { email: ['Ya existe una cuenta con este email.'] },
            { status: 400 },
          );
        }
      }
      if (body.name !== undefined && !body.name.trim()) {
        return HttpResponse.json(
          { name: ['Este campo no puede estar en blanco.'] },
          { status: 400 },
        );
      }
      const { name, notify_push, notify_email } = body;
      const user: User = {
        ...db.user,
        ...(name !== undefined && { name: name.trim() }),
        ...(email && { email }),
        ...(notify_push !== undefined && { notify_push }),
        ...(notify_email !== undefined && { notify_email }),
      };
      db.user = user;
      if (entry) Object.assign(entry, { email: user.email, user });
      return HttpResponse.json(withUsage(user, db));
    }),

    http.delete('*/api/auth/me/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const { password } = (await request.json()) as { password?: string };
      const entry = db.accounts.find((a) => a.user.id === db.user?.id);
      if (password !== entry?.password) return wrongPassword('password');
      db.accounts = db.accounts.filter((a) => a !== entry);
      db.lotes = [];
      db.alertRules = [];
      db.alertEvents = [];
      db.pushSubscriptions = [];
      db.user = null;
      return new HttpResponse(null, { status: 204 });
    }),

    http.post('*/api/auth/password/change/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const body = (await request.json()) as { current_password: string; new_password: string };
      const entry = db.accounts.find((a) => a.user.id === db.user?.id);
      if (body.current_password !== entry?.password) return wrongPassword('current_password');
      if (body.new_password.length < 8) return shortPassword();
      entry.password = body.new_password;
      return new HttpResponse(null, { status: 204 });
    }),

    http.post('*/api/auth/password/reset/', async ({ request }) => {
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const { email } = (await request.json()) as { email: string };
      db.resetRequests.push(email.trim().toLowerCase());
      return new HttpResponse(null, { status: 204 });
    }),

    http.post('*/api/auth/password/reset/confirm/', async ({ request }) => {
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const body = (await request.json()) as { uid: string; token: string; new_password: string };
      const key = `${body.uid}/${body.token}`;
      const entry = db.accounts.find((a) => a.email === db.resetLinks[key]);
      if (!entry) {
        return HttpResponse.json(
          { detail: 'El enlace no es válido o venció. Pedí uno nuevo.' },
          { status: 400 },
        );
      }
      if (body.new_password.length < 8) return shortPassword('new_password');
      entry.password = body.new_password;
      delete db.resetLinks[key];
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('*/api/planes/', () =>
      HttpResponse.json({ plans: db.plans, founders: db.founders, trial_days: db.trialDays }),
    ),

    http.get('*/api/auth/suscripcion/', () =>
      db.user ? HttpResponse.json(subscriptionOf(db.user, db)) : forbidden(),
    ),

    http.post('*/api/auth/suscripcion/pedido/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const input = (await request.json()) as PlanRequestInput;
      const detail = planRequestError(input, db.user, db);
      if (detail) return HttpResponse.json({ detail }, { status: 400 });
      db.planRequest = {
        id: db.nextId++,
        kind: input.kind,
        plan: input.kind === 'change' ? input.plan : 'basico', // like the backend
        created_at: new Date().toISOString(),
      };
      return HttpResponse.json(db.planRequest, { status: 201 });
    }),

    http.delete('*/api/auth/suscripcion/pedido/', ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      db.planRequest = null;
      return new HttpResponse(null, { status: 204 });
    }),

    http.post('*/api/auth/login/', async ({ request }) => {
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const body = (await request.json()) as { email?: string; password?: string };
      const account = db.accounts.find(
        (a) => a.email === body.email?.trim().toLowerCase() && a.password === body.password,
      );
      if (!account) {
        return HttpResponse.json({ detail: 'Email o contraseña incorrectos.' }, { status: 400 });
      }
      db.user = account.user;
      rotateCsrf(db);
      return HttpResponse.json(account.user);
    }),

    http.post('*/api/auth/register/', async ({ request }) => {
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const body = (await request.json()) as { email?: string; password?: string; name?: string };
      const email = body.email?.trim().toLowerCase() ?? '';
      if (!body.name?.trim()) {
        return HttpResponse.json({ name: ['Este campo es requerido.'] }, { status: 400 });
      }
      if (db.accounts.some((a) => a.email === email)) {
        return HttpResponse.json(
          { email: ['Ya existe una cuenta con este email.'] },
          { status: 400 },
        );
      }
      if (!body.password || body.password.length < 8) {
        return HttpResponse.json(
          { password: ['La contraseña debe tener al menos 8 caracteres.'] },
          { status: 400 },
        );
      }
      const user = signUp(db, { id: db.nextId++, email, name: body.name?.trim() ?? '' });
      db.accounts.push({ email, password: body.password, user });
      db.user = user;
      rotateCsrf(db);
      return HttpResponse.json(user, { status: 201 });
    }),

    http.post('*/api/auth/logout/', ({ request }) => {
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      db.user = null;
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('*/api/lotes/', () => {
      if (!db.user) return forbidden();
      return HttpResponse.json([...db.lotes].sort(byName));
    }),

    http.post('*/api/lotes/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const body = (await request.json()) as LoteInput;
      const errors = validateLote(body, false);
      if (Object.keys(errors).length) return HttpResponse.json(errors, { status: 400 });
      const cap = db.user.plan?.max_lotes;
      if (cap != null && db.lotes.length >= cap) {
        const detail = `Tu plan ${db.user.plan?.name} permite hasta ${cap} lotes. Mirá los planes para sumar más.`;
        return HttpResponse.json({ detail, code: 'plan_limit' }, { status: 402 });
      }
      const lote = toLote(db, db.nextId++, { ...body, plantings: body.plantings ?? [] });
      db.lotes.push(lote);
      return HttpResponse.json(lote, { status: 201 });
    }),

    http.get('*/api/pronostico/', ({ request }) => {
      const params = new URL(request.url).searchParams;
      const lat = Number(params.get('lat'));
      const lon = Number(params.get('lon'));
      db.forecastRequests.push({ lat, lon });
      if (!insideArgentina(lat, lon)) {
        return HttpResponse.json({ detail: OUTSIDE_ARGENTINA }, { status: 400 });
      }
      return HttpResponse.json(db.publicForecast(lat, lon));
    }),

    http.get('*/api/lugares/reverso/', ({ request }) => {
      const params = new URL(request.url).searchParams;
      return HttpResponse.json(nearestPlace(Number(params.get('lat')), Number(params.get('lon'))));
    }),

    http.get('*/api/lugares/', ({ request }) => {
      const query = fold(new URL(request.url).searchParams.get('q') ?? '').trim();
      if (query.length < 2) {
        return HttpResponse.json(
          { detail: 'Escribí al menos 2 letras para buscar.' },
          { status: 400 },
        );
      }
      // Like Georef: whole words with a little fuzz ("rosar" finds Rosario, "rosa" does not).
      const found = demoPlaces.filter((p) =>
        fold(p.name)
          .split(/\s+/)
          .some(
            (word) =>
              word.startsWith(query) &&
              query.length >= Math.min(word.length, 3) &&
              word.length - query.length <= 2,
          ),
      );
      return HttpResponse.json(found.slice(0, 8));
    }),

    http.get('*/api/lotes/:id/pronostico/', ({ params }) => {
      if (!db.user) return forbidden();
      const id = Number(params.id);
      if (!db.lotes.some((l) => l.id === id)) {
        return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      }
      const forecast = db.loteForecasts[id];
      return forecast
        ? HttpResponse.json(forecast)
        : HttpResponse.json({ detail: NO_LOTE_FORECAST }, { status: 404 });
    }),

    http.get('*/api/lotes/:id/historico/', ({ request, params }) => {
      if (!db.user) return forbidden();
      const id = Number(params.id);
      const query = new URL(request.url).searchParams;
      const desde = query.get('desde');
      const hasta = query.get('hasta');
      db.historyRequests.push({ id, desde, hasta });
      if (!db.lotes.some((l) => l.id === id)) {
        return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      }
      const range = checkHistoryRange(desde, hasta, localToday());
      if ('error' in range) return HttpResponse.json({ detail: range.error }, { status: 400 });
      return HttpResponse.json(db.loteHistory(id, range.from, range.to));
    }),

    http.get('*/api/lotes/:id/', ({ params }) => {
      if (!db.user) return forbidden();
      const lote = db.lotes.find((l) => l.id === Number(params.id));
      return lote
        ? HttpResponse.json(lote)
        : HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
    }),

    http.patch('*/api/lotes/:id/', async ({ request, params }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const index = db.lotes.findIndex((l) => l.id === Number(params.id));
      const previous = db.lotes[index];
      if (!previous) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      const body = (await request.json()) as Partial<LoteInput>;
      const errors = validateLote(body, true);
      if (Object.keys(errors).length) return HttpResponse.json(errors, { status: 400 });
      const merged: LoteWrite = {
        name: body.name ?? previous.name,
        establishment: body.establishment ?? previous.establishment,
        locality: body.locality ?? previous.locality,
        latitude: body.latitude ?? previous.latitude,
        longitude: body.longitude ?? previous.longitude,
        plantings: body.plantings,
        area_ha: body.area_ha === undefined ? previous.area_ha : body.area_ha,
        boundary: body.boundary === undefined ? previous.boundary : body.boundary,
      };
      const lote = toLote(db, previous.id, merged, previous);
      db.lotes[index] = lote;
      return HttpResponse.json(lote);
    }),

    http.delete('*/api/lotes/:id/', ({ request, params }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const before = db.lotes.length;
      db.lotes = db.lotes.filter((l) => l.id !== Number(params.id));
      db.alertRules = db.alertRules.filter((r) => r.lote !== Number(params.id));
      return before === db.lotes.length
        ? HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 })
        : new HttpResponse(null, { status: 204 });
    }),

    http.get('*/api/alertas/reglas/', () => {
      if (!db.user) return forbidden();
      return HttpResponse.json(serializeRules(db));
    }),

    http.post('*/api/alertas/reglas/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const body = (await request.json()) as AlertRuleInput;
      const errors = ruleErrors(body, db);
      if (Object.keys(errors).length) return HttpResponse.json(errors, { status: 400 });
      const cap = db.user.plan?.max_alert_rules;
      if (cap != null && db.alertRules.length >= cap) {
        const detail = `Tu plan ${db.user.plan?.name} permite hasta ${cap} reglas de alerta. Mirá los planes para sumar más.`;
        return HttpResponse.json({ detail, code: 'plan_limit' }, { status: 402 });
      }
      db.alertRules.push(toRule(db.nextId++, body, db));
      return HttpResponse.json(serializeRules(db).at(-1), { status: 201 });
    }),

    http.patch('*/api/alertas/reglas/:id/', async ({ request, params }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const index = db.alertRules.findIndex((r) => r.id === Number(params.id));
      const previous = db.alertRules[index];
      if (!previous) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      const merged = { ...previous, ...((await request.json()) as Partial<AlertRuleInput>) };
      const errors = ruleErrors(merged, db);
      if (Object.keys(errors).length) return HttpResponse.json(errors, { status: 400 });
      db.alertRules[index] = toRule(previous.id, merged, db, previous);
      return HttpResponse.json(serializeRules(db)[index]);
    }),

    http.delete('*/api/alertas/reglas/:id/', ({ request, params }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const before = db.alertRules.length;
      db.alertRules = db.alertRules.filter((r) => r.id !== Number(params.id));
      return before === db.alertRules.length
        ? HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 })
        : new HttpResponse(null, { status: 204 });
    }),

    http.get('*/api/alertas/eventos/', () => {
      if (!db.user) return forbidden();
      return HttpResponse.json({
        results: db.alertEvents,
        unread_count: db.alertEvents.filter((e) => e.read_at === null).length,
      });
    }),

    http.post('*/api/alertas/eventos/leer/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const { ids } = (await request.json()) as { ids?: number[] };
      const now = new Date().toISOString();
      db.alertEvents = db.alertEvents.map((e) =>
        e.read_at === null && (!ids || ids.includes(e.id)) ? { ...e, read_at: now } : e,
      );
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('*/api/alertas/push/clave/', () => {
      if (!db.user) return forbidden();
      return db.pushPublicKey
        ? HttpResponse.json({ public_key: db.pushPublicKey })
        : HttpResponse.json(
            { detail: 'Las notificaciones push todavía no están configuradas.' },
            { status: 503 },
          );
    }),

    http.post('*/api/alertas/push/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      if (!db.user.plan?.allows_push) {
        const detail = `Tu plan ${db.user.plan?.name} no incluye notificaciones push. Mirá los planes para sumar más.`;
        return HttpResponse.json({ detail, code: 'plan_limit' }, { status: 402 });
      }
      const body = (await request.json()) as PushSubscriptionInput;
      if (!body.endpoint?.startsWith('https://')) {
        return HttpResponse.json(
          { endpoint: ['La suscripción push no es válida.'] },
          { status: 400 },
        );
      }
      const existed = db.pushSubscriptions.some((s) => s.endpoint === body.endpoint);
      db.pushSubscriptions = [
        ...db.pushSubscriptions.filter((s) => s.endpoint !== body.endpoint),
        body,
      ];
      return HttpResponse.json({ endpoint: body.endpoint }, { status: existed ? 200 : 201 });
    }),

    http.delete('*/api/alertas/push/', async ({ request }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const { endpoint } = (await request.json()) as { endpoint: string };
      db.pushSubscriptions = db.pushSubscriptions.filter((s) => s.endpoint !== endpoint);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
