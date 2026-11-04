/**
 * Same-origin JSON client for the Django API: session cookie plus CSRF (S6, S8).
 * No JWT: the browser keeps the httpOnly session cookie; we only echo the CSRF cookie.
 */

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const OFFLINE_MESSAGE = 'Sin conexión. Probá de nuevo cuando tengas señal.';

export class ApiError extends Error {
  readonly status: number;
  /** DRF field errors, e.g. `{ email: ['Ya existe…'] }`. */
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfRequest: Promise<void> | null = null;

/** Asks Django to set the `csrftoken` cookie, once, or again when `force` (stale token). */
export function ensureCsrf(force = false): Promise<void> {
  if (!force && readCookie('csrftoken')) return Promise.resolve();
  csrfRequest ??= rawFetch('/api/auth/csrf/', { method: 'GET' })
    .then(() => undefined)
    .finally(() => {
      csrfRequest = null;
    });
  return csrfRequest;
}

function url(path: string): string {
  // Absolute URL so the same code runs in the browser and under Node's fetch in tests.
  return new URL(path, window.location.origin).toString();
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url(path), { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, OFFLINE_MESSAGE);
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (e.g. an nginx error page): fall through to a generic message.
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === 'string') return new ApiError(response.status, record.detail);
    const fields: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(record)) {
      if (Array.isArray(value)) fields[key] = value.map(String);
    }
    if (Object.keys(fields).length) {
      const first = fields.non_field_errors?.[0] ?? 'Revisá los datos marcados.';
      return new ApiError(response.status, first, fields);
    }
  }
  return new ApiError(
    response.status,
    response.status >= 500
      ? 'El servidor tuvo un problema. Probá de nuevo en unos minutos.'
      : 'No pudimos completar el pedido.',
  );
}

/** Django answers a missing or stale token with 403 and a detail that names CSRF. */
const isCsrfFailure = (error: ApiError) => error.status === 403 && /csrf/i.test(error.message);

export async function apiFetch<T>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  const unsafe = UNSAFE.has(method);
  const send = async (refreshCsrf: boolean) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (unsafe) {
      await ensureCsrf(refreshCsrf);
      // Read the cookie on every request: Django rotates the token on login and register.
      const token = readCookie('csrftoken');
      if (token) headers['X-CSRFToken'] = token;
    }
    return rawFetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await send(false);
  if (!response.ok && unsafe && response.status === 403) {
    const error = await toApiError(response);
    if (!isCsrfFailure(error)) throw error;
    // A stale token (old tab, rotated session): fetch a fresh one and retry exactly once.
    response = await send(true);
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
