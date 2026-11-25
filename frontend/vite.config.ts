import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Theme colours from the direction contract (.impeccable/surfaces/frontend-src-pages-inicio-tsx.md):
// the clear-day sky (src/lib/sky.ts) for the browser bar and the splash.
const SKY = '#1d68c4';
const SKY_DEEP = '#124f9e';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Our own worker (src/sw.ts): Web Push needs push and notificationclick handlers (S7).
      // The runtime routes and the from-cache stamp live there now.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      injectManifest: {
        // App shell: JS, CSS, HTML, icons and the self-hosted fonts.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The map chunk and its worker are large and only needed when placing a lote.
        globIgnores: ['**/MapPicker-*', '**/maplibre-gl-worker-*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
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
    // Node 25+ ships its own localStorage global, which shadows jsdom's and is undefined
    // without --localstorage-file, so every test failed in the setup's localStorage.clear().
    execArgv:
      Number(process.versions.node.split('.')[0]) >= 25 ? ['--no-experimental-webstorage'] : [],
  },
});
