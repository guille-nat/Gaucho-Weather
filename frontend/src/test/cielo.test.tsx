import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForecastNow } from '../api/types';
import { createMockDb } from '../mocks/handlers';
import { demoPublicForecast } from '../mocks/forecast';
import { renderApp } from './renderApp';

/** jsdom has no matchMedia: answer the reduced-motion query as the phone would. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderSky(now: Partial<ForecastNow>) {
  const forecast = demoPublicForecast('sol');
  forecast.now = { ...forecast.now, ...now };
  return renderApp('/', createMockDb({ user: null, publicForecast: () => forecast }));
}

const RAIN = { sky: 'lluvia', rain_mm: 3.2, cloud_cover_pct: 97 } as const;

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('the animated sky (cielo-animado)', () => {
  it('draws the weather of this hour behind the forecast, hidden from screen readers', async () => {
    stubReducedMotion(false);
    renderSky(RAIN);

    await screen.findByRole('region', { name: 'Ahora' });
    const layer = document.querySelector('canvas.sky-motion');
    expect(layer).not.toBeNull();
    expect(layer).toHaveAttribute('aria-hidden', 'true');
  });

  it('pauses and resumes the sky from the hero, and remembers it on this phone', async () => {
    stubReducedMotion(false);
    const { user, unmount } = renderSky(RAIN);

    const now = await screen.findByRole('region', { name: 'Ahora' });
    await user.click(within(now).getByRole('button', { name: 'Pausar el cielo' }));
    expect(within(now).getByRole('button', { name: 'Mover el cielo' })).toBeInTheDocument();

    unmount();
    renderSky(RAIN);
    const again = await screen.findByRole('region', { name: 'Ahora' });
    expect(within(again).getByRole('button', { name: 'Mover el cielo' })).toBeInTheDocument();
  });

  it('offers no pause when nothing moves: a clear calm day', async () => {
    stubReducedMotion(false);
    renderSky({ sky: 'sol', rain_mm: 0, cloud_cover_pct: 2, wind_kmh: 3 });

    const now = await screen.findByRole('region', { name: 'Ahora' });
    expect(within(now).queryByRole('button', { name: /el cielo/ })).not.toBeInTheDocument();
  });

  it('keeps the sky still and offers no pause with reduced motion', async () => {
    stubReducedMotion(true);
    renderSky(RAIN);

    const now = await screen.findByRole('region', { name: 'Ahora' });
    expect(within(now).queryByRole('button', { name: /el cielo/ })).not.toBeInTheDocument();
    expect(document.querySelector('canvas.sky-motion')).not.toBeNull();
  });

  it('leaves the other screens on the plain sky colour', async () => {
    stubReducedMotion(false);
    renderApp('/ingresar', createMockDb({ user: null }));

    await screen.findByRole('heading', { name: 'Ingresar' });
    expect(document.querySelector('canvas.sky-motion')).toBeNull();
  });
});
