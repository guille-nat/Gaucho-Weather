/**
 * Service worker, built by vite-plugin-pwa with `strategies: 'injectManifest'` (vite.config.ts).
 * It is our own file because Web Push needs `push` and `notificationclick` handlers (S7), which
 * the generated worker cannot have. Everything above the push section reproduces what
 * `generateSW` produced before, route by route: change it only on purpose.
 * Type-checked with the WebWorker lib by tsconfig.sw.json, outside the app's DOM program.
 */
import type { WorkboxPlugin } from 'workbox-core';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// --- Updates -------------------------------------------------------------------------------
// Same as the generated worker: a new version waits until it is told to take over
// (registerType 'autoUpdate' with injectRegister false never set skipWaiting/clientsClaim).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

// --- App shell -----------------------------------------------------------------------------
// JS, CSS, HTML, icons and the self-hosted fonts; the list comes from injectManifest.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

// --- API -----------------------------------------------------------------------------------
/** Network timeout before NetworkFirst falls back to the cache. */
const NETWORK_TIMEOUT_SECONDS = 6;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

/**
 * Marks answers served from a runtime cache (no network, or slower than the timeout): the app
 * shows them as offline data with the server's own `Date`, never as fresh (src/api/client.ts,
 * apiGetServed reads `X-From-SW-Cache`).
 */
const markFromCache: WorkboxPlugin = {
  cachedResponseWillBeUsed: async ({ cachedResponse }) => {
    if (!cachedResponse) return cachedResponse;
    const headers = new Headers(cachedResponse.headers);
    headers.set('X-From-SW-Cache', '1');
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    });
  },
};

// Auth must always hit the network: never cache sessions or CSRF tokens.
registerRoute(({ url }) => url.pathname.startsWith('/api/auth/'), new NetworkOnly());

// Alerts are private and change with every forecast: never cached.
registerRoute(({ url }) => url.pathname.startsWith('/api/alertas/'), new NetworkOnly());

// Private: lotes and their forecasts. Deleted when a session ends (src/query/session.ts).
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/lotes/'),
  new NetworkFirst({
    cacheName: 'api-lotes',
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: WEEK_SECONDS }),
      new CacheableResponsePlugin({ statuses: [200] }),
      markFromCache,
    ],
  }),
);

// Public forecast, places and plans, keyed by the full URL (lat/lon, q). Nobody's data, so it
// survives a logout and Inicio opens offline on the last place.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/pronostico/') ||
    url.pathname.startsWith('/api/lugares/') ||
    url.pathname.startsWith('/api/planes/'),
  new NetworkFirst({
    cacheName: 'api-publico',
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: WEEK_SECONDS }),
      new CacheableResponsePlugin({ statuses: [200] }),
      markFromCache,
    ],
  }),
);

// --- Push (S7) -----------------------------------------------------------------------------
const DEFAULT_TITLE = 'Gaucho Weather';
const DEFAULT_URL = '/alertas';
const ICON = '/pwa-192.png';

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** The server sends JSON `{title, body, url, tag}`; anything else is shown as plain text. */
function readPayload(data: PushMessageData | null): PushPayload {
  if (!data) return {};
  try {
    const parsed: unknown = data.json();
    if (parsed && typeof parsed === 'object') return parsed as PushPayload;
  } catch {
    // Not JSON: fall through to the text body.
  }
  const text = data.text();
  return text ? { body: text } : {};
}

/** Only same-origin paths are opened; anything else goes to the inbox. */
function sameOriginUrl(raw: unknown): string {
  if (typeof raw === 'string' && raw) {
    try {
      const url = new URL(raw, self.location.origin);
      if (url.origin === self.location.origin) return url.href;
    } catch {
      // Malformed: use the default below.
    }
  }
  return new URL(DEFAULT_URL, self.location.origin).href;
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event.data);
  const options: NotificationOptions = {
    body: typeof payload.body === 'string' ? payload.body : undefined,
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    data: { url: typeof payload.url === 'string' ? payload.url : DEFAULT_URL },
    icon: ICON,
    badge: ICON,
  };
  const title = typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE;
  event.waitUntil(self.registration.showNotification(title, options));
});

async function openApp(target: string): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = windows.find((w) => new URL(w.url).origin === self.location.origin);
  if (!client) {
    await self.clients.openWindow(target);
    return;
  }
  const focused = await client.focus();
  if (focused.url === target) return;
  try {
    await focused.navigate(target);
  } catch {
    // navigate() rejects for a window this worker does not control yet.
    await self.clients.openWindow(target);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const url = data && typeof data === 'object' ? (data as { url?: unknown }).url : undefined;
  event.waitUntil(openApp(sameOriginUrl(url)));
});
