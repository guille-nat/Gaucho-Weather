import { getResponse } from 'msw';
import { demoLotes, demoUser } from './fixtures';
import type { Forecast } from '../api/types';
import { demoForecast, demoPublicForecast, type DemoSky } from './forecast';
import { createHandlers, createMockDb } from './handlers';

/**
 * `pnpm dev:mock`: the app runs against an in-memory API with three synthetic lotes.
 * `?escenario=vacio` starts with no lotes; `?escenario=anonimo` starts logged out
 * (log in with the demo email and the password `demo1234`).
 * `?cielo=sol|lluvia|noche` picks the weather (default `sol`) of Inicio and of every lote; the
 * place name comes from the coordinates. `?ahora=sol|parcial|nublado|lluvia|tormenta` overrides
 * the sky of this hour everywhere, to see the animated background (`?cielo=noche&ahora=sol` is a
 * starry night). Each lote keeps its own decisions. Searches know a few towns of the zona núcleo
 * (src/mocks/forecast.ts).
 *
 * Requests to /api/ are answered in-page by the same MSW handlers the tests use, without a
 * service worker, so the mock also works in headless screenshots.
 */
const NOW_OF = {
  sol: { sky: 'sol', cloud_cover_pct: 4, rain_mm: 0 },
  parcial: { sky: 'parcial', cloud_cover_pct: 50, rain_mm: 0 },
  nublado: { sky: 'nublado', cloud_cover_pct: 92, rain_mm: 0 },
  lluvia: { sky: 'lluvia', cloud_cover_pct: 97, rain_mm: 3.5 },
  tormenta: { sky: 'tormenta', cloud_cover_pct: 100, rain_mm: 9 },
} as const;

export function startMockApi() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('escenario');
  const sky = (['sol', 'lluvia', 'noche'] as const).find((s) => s === params.get('cielo'));
  const variant: DemoSky = sky ?? 'sol';
  const now = (['sol', 'parcial', 'nublado', 'lluvia', 'tormenta'] as const).find(
    (s) => s === params.get('ahora'),
  );
  const db = createMockDb({
    user: scenario === 'anonimo' ? null : demoUser,
    accounts: [{ email: demoUser.email, password: 'demo1234', user: demoUser }],
    lotes: scenario === 'vacio' ? [] : demoLotes(),
  });
  /** The chosen weather on a forecast, keeping what is the lote's own (its decisions). */
  const withWeather = <T extends Forecast>(base: T): T => {
    const weather = sky ? demoForecast(variant) : base;
    const { now: weatherNow, today, daily, hourly, rain_past_7d_mm } = weather;
    const forecast = { ...base, today, daily, hourly, rain_past_7d_mm, now: weatherNow };
    if (now) forecast.now = { ...forecast.now, ...NOW_OF[now] };
    return forecast;
  };
  const named = db.publicForecast;
  db.publicForecast = (lat, lon) => ({
    ...withWeather(demoPublicForecast(variant)),
    place: named(lat, lon).place,
  });
  for (const [id, forecast] of Object.entries(db.loteForecasts)) {
    db.loteForecasts[Number(id)] = withWeather(forecast);
  }
  // The prices decided on 2026-11-17 (precios-productor L8); the real ones live in the admin.
  const PRICES = { basico: 0, productor: 14900, empresa: 49900 } as const;
  db.plans = db.plans.map((plan) => ({ ...plan, price_ars_month: PRICES[plan.code] }));
  const handlers = createHandlers(db);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname.startsWith('/api/')) {
      const response = await getResponse(handlers, request);
      if (response) return response;
    }
    return realFetch(input, init);
  };
}
