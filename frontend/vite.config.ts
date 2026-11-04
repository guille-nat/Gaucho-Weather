import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Theme colours from the direction contract (.impeccable/surfaces/frontend-src-pages-inicio-tsx.md):
// the clear-day sky (src/lib/sky.ts) for the browser bar and the splash.
const SKY = '#1d68c4';
const SKY_DEEP = '#124f9e';

/**
 * Marks answers served from a runtime cache (no network, or slower than the timeout): the app
 * shows them as offline data with the server's own `Date`, never as fresh (src/api/client.ts,
 * apiGetServed). Serialized into sw.js, so it must stay self-contained.
 */
const markFromCache = {
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => {
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

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Gaucho Weather',
        short_name: 'Gaucho Weather',
        description: 'El clima de donde estés, traducido al trabajo del campo.',
        lang: 'es-AR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: SKY_DEEP,
        theme_color: SKY,
        categories: ['weather', 'productivity'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: JS, CSS, HTML, icons and the self-hosted fonts.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The map chunk is large and only needed when picking a location.
        globIgnores: ['**/MapPicker-*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Auth must always hit the network: never cache sessions or CSRF tokens.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/auth/'),
            handler: 'NetworkOnly',
          },
          {
            // Private: lotes and their forecasts. Deleted when a session ends (query/session.ts).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/lotes/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-lotes',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
              plugins: [markFromCache],
            },
          },
          {
            // Public forecast and places (S10), keyed by the full URL (lat/lon, q). Nobody's
            // data, so it survives a logout and Inicio opens offline on the last place.
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/pronostico/') ||
              url.pathname.startsWith('/api/lugares/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-publico',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
              plugins: [markFromCache],
            },
          },
        ],
      },
    }),
  ],
  build: {
    // MapLibre (~1 MB) lives in its own lazy chunk; the app shell stays far below this.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8001',
        // Outside Docker the backend is published on 8001; compose sets http://backend:8000.
        // Keep the browser's Host so Django's CSRF origin check sees same-origin.
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
