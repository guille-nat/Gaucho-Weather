import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Lote, LoteInput, User } from '../api/types';

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
}

export function createMockDb(partial: Partial<MockDb> = {}): MockDb {
  return {
    user: null,
    accounts: [],
    lotes: [],
    nextId: 100,
    csrfToken: 'mock-csrf-token',
    unsafeRequests: [],
    ...partial,
  };
}

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

function validateLote(body: Partial<LoteInput>, partial: boolean) {
  const errors: Record<string, string[]> = {};
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

function toLote(id: number, body: LoteInput, previous?: Lote): Lote {
  const now = new Date().toISOString();
  return {
    id,
    name: body.name,
    establishment: body.establishment ?? '',
    locality: body.locality ?? '',
    latitude: Number(body.latitude.toFixed(6)),
    longitude: Number(body.longitude.toFixed(6)),
    crop: body.crop ?? null,
    sowing_date: body.sowing_date ?? null,
    area_ha:
      body.area_ha === null || body.area_ha === undefined ? null : Number(body.area_ha.toFixed(2)),
    boundary: previous?.boundary ?? null,
    summary: previous?.summary ?? null,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
}

const byName = (a: Lote, b: Lote) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function createHandlers(db: MockDb): HttpHandler[] {
  return [
    http.get('*/api/health/', () => HttpResponse.json({ status: 'ok' })),

    http.get('*/api/auth/csrf/', () => {
      document.cookie = `csrftoken=${db.csrfToken}; path=/`;
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('*/api/auth/me/', () => (db.user ? HttpResponse.json(db.user) : forbidden())),

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
      const user: User = { id: db.nextId++, email, name: body.name?.trim() ?? '' };
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
      const lote = toLote(db.nextId++, body);
      db.lotes.push(lote);
      return HttpResponse.json(lote, { status: 201 });
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
      const merged: LoteInput = {
        name: body.name ?? previous.name,
        establishment: body.establishment ?? previous.establishment,
        locality: body.locality ?? previous.locality,
        latitude: body.latitude ?? previous.latitude,
        longitude: body.longitude ?? previous.longitude,
        crop: body.crop === undefined ? previous.crop : body.crop,
        sowing_date: body.sowing_date === undefined ? previous.sowing_date : body.sowing_date,
        area_ha: body.area_ha === undefined ? previous.area_ha : body.area_ha,
      };
      const lote = toLote(previous.id, merged, previous);
      db.lotes[index] = lote;
      return HttpResponse.json(lote);
    }),

    http.delete('*/api/lotes/:id/', ({ request, params }) => {
      if (!db.user) return forbidden();
      const failed = csrfFailure(request, db);
      if (failed) return failed;
      const before = db.lotes.length;
      db.lotes = db.lotes.filter((l) => l.id !== Number(params.id));
      return before === db.lotes.length
        ? HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 })
        : new HttpResponse(null, { status: 204 });
    }),
  ];
}
