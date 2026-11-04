import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoPublicForecast } from '../mocks/forecast';
import { renderApp } from './renderApp';
import { server } from './server';

const CASILDA = { lat: -33.0441, lon: -61.1683 };
const ROSARIO = { lat: -32.947, lon: -60.639 };

/** jsdom has no geolocation: stand in for the browser's, granting or denying it. */
function stubGeolocation(answer: { lat: number; lon: number } | 'denied') {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) => {
    if (answer === 'denied') {
      fail?.({
        code: 1,
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    } else {
      ok({
        coords: { latitude: answer.lat, longitude: answer.lon, accuracy: 25 },
        timestamp: Date.now(),
      } as GeolocationPosition);
    }
  });
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

const near = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;

describe('Inicio: the weather first, no account needed', () => {
  it('shows the forecast of where the phone is', async () => {
    const asked = stubGeolocation(CASILDA);
    const db = createMockDb({ user: null });
    renderApp('/', db);
    await waitFor(() => expect(near(db.forecastRequests.at(-1)!, CASILDA)).toBe(true));

    expect(await screen.findByRole('heading', { level: 1, name: 'Casilda' })).toBeInTheDocument();
    expect(asked).toHaveBeenCalledTimes(1);
    // 21,7 °C now, clear sky, 27,4 / 12,1 today.
    const now = await screen.findByRole('region', { name: 'Ahora' });
    expect(within(now).getByText('22°')).toBeInTheDocument();
    expect(within(now).getByText('Soleado')).toBeInTheDocument();
    expect(within(now).getByText('Máx 27° · Mín 12°')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ingresar' })).not.toBeInTheDocument();
  });

  it('shows the hours ahead, the rain fallen, the wind and the sun times', async () => {
    stubGeolocation(CASILDA);
    renderApp('/', createMockDb({ user: null }));

    const hours = await screen.findByRole('table', { name: 'Próximas horas' });
    // 48 columns of hours plus the row headers.
    expect(within(hours).getAllByRole('columnheader')).toHaveLength(48);
    expect(within(hours).getByRole('columnheader', { name: 'Ahora' })).toBeInTheDocument();
    for (const row of ['Temperatura', 'Lluvia', 'Probabilidad', 'Viento', 'Ráfagas']) {
      expect(within(hours).getByRole('rowheader', { name: new RegExp(row) })).toBeInTheDocument();
    }
    expect(screen.getByText('4,2 mm')).toBeInTheDocument(); // last 7 days
    expect(screen.getByText('06:04')).toBeInTheDocument();
    expect(screen.getByText('19:33')).toBeInTheDocument();
  });

  it('asks for a place when the phone does not share its location', async () => {
    stubGeolocation('denied');
    const db = createMockDb({ user: null });
    renderApp('/', db);

    expect(await screen.findByText(/No pudimos usar tu ubicación/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar un lugar' })).toHaveAttribute(
      'href',
      '/buscar',
    );
    // Meanwhile, Rosario: there is no last place yet.
    expect(await screen.findByRole('heading', { level: 1, name: 'Rosario' })).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Ahora' });
    expect(near(db.forecastRequests.at(-1)!, ROSARIO)).toBe(true);
  });

  it('searches a place, shows its forecast and remembers it', async () => {
    stubGeolocation('denied');
    const db = createMockDb({ user: null });
    const { user } = renderApp('/', db);

    await user.click(await screen.findByRole('link', { name: 'Buscar lugar' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar localidad o paraje' }), 'casil');
    const results = await screen.findByRole('list', { name: 'Resultados' });
    await user.click(within(results).getByRole('button', { name: /Casilda/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Casilda' })).toBeInTheDocument();
    await waitFor(() => expect(near(db.forecastRequests.at(-1)!, CASILDA)).toBe(true));
    expect(await screen.findByRole('region', { name: 'Ahora' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Buscar lugar' }));
    const recent = screen.getByRole('list', { name: 'Recientes' });
    expect(within(recent).getByRole('button', { name: /Casilda/ })).toBeInTheDocument();
  });

  it('says it only covers Argentina for a place outside it', async () => {
    stubGeolocation({ lat: 40.4168, lon: -3.7038 });
    renderApp('/', createMockDb({ user: null }));

    expect(await screen.findByText('Por ahora solo cubrimos Argentina.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar un lugar' })).toBeInTheDocument();
  });

  it('shows the server message when the forecast service is down, with a retry', async () => {
    stubGeolocation(CASILDA);
    renderApp('/', createMockDb({ user: null }));
    server.use(
      http.get('*/api/pronostico/', () =>
        HttpResponse.json(
          { detail: 'El pronóstico no está disponible ahora. Probá en unos minutos.' },
          { status: 503 },
        ),
      ),
    );

    expect(
      await screen.findByText('El pronóstico no está disponible ahora. Probá en unos minutos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('draws the rain of the 7 days at one shared scale, with mm and probability', async () => {
    stubGeolocation(CASILDA);
    renderApp('/', createMockDb({ user: null }));

    const week = await screen.findByRole('list', { name: 'Próximos 7 días' });
    const days = within(week).getAllByRole('listitem');
    expect(days).toHaveLength(7);
    const width = (day: HTMLElement) =>
      parseFloat(day.querySelector<HTMLElement>('[data-rain-bar]')!.style.width);
    // Saturday, 12,4 mm, is the wettest day: the scale. Friday's 1,3 mm is drawn against it.
    expect(within(days[3]!).getByText('12,4 mm')).toBeInTheDocument();
    expect(within(days[3]!).getByText('85 %')).toBeInTheDocument();
    expect(width(days[3]!)).toBe(100);
    expect(width(days[2]!)).toBeCloseTo((1.3 / 12.4) * 100, 1);
    expect(width(days[0]!)).toBe(0);
  });

  it('gives the most urgent field verdict with its reason, honest about validation', async () => {
    stubGeolocation(CASILDA);
    const { user } = renderApp('/', createMockDb({ user: null }));

    const verdict = await screen.findByRole('button', { name: /Para el campo/ });
    expect(verdict).toHaveTextContent(
      'Sábado se esperan 12,4 mm (85 %): no entres con la sembradora ese día.',
    );
    expect(verdict).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByText('Estimación con reglas publicadas; todavía sin validar en tu zona'),
    ).not.toBeInTheDocument();

    await user.click(verdict);
    expect(
      screen.getByText('Estimación con reglas publicadas; todavía sin validar en tu zona'),
    ).toBeInTheDocument();
  });

  it('leaves out the spray verdict once there is no daylight left', async () => {
    stubGeolocation(CASILDA);
    renderApp(
      '/',
      createMockDb({ user: null, publicForecast: () => demoPublicForecast('noche', null) }),
    );

    const verdict = await screen.findByRole('button', { name: /Para el campo/ });
    expect(verdict).toHaveTextContent('Noche nublada o con viento');
    expect(verdict).not.toHaveTextContent('Ya no quedan horas de luz');
    // Missing values read as a dash, never as zero.
    expect(screen.getByText('Ráfagas').closest('div')).toHaveTextContent('—');
  });

  it('shows a forecast answered by the service worker cache as offline data', async () => {
    stubGeolocation(CASILDA);
    renderApp('/', createMockDb({ user: null }));
    const servedAt = new Date(Date.UTC(2026, 10, 2, 23, 45)).toUTCString();
    server.use(
      http.get('*/api/pronostico/', () =>
        HttpResponse.json(demoPublicForecast('sol'), {
          headers: { 'X-From-SW-Cache': '1', Date: servedAt },
        }),
      ),
    );

    expect(await screen.findByText('Sin conexión · datos de las 20:45')).toBeInTheDocument();
  });

  it('omits the probability for a place with no ensemble, never showing it as zero', async () => {
    stubGeolocation(CASILDA);
    const noEnsemble = () => {
      const forecast = demoPublicForecast('sol');
      forecast.daily.forEach((day) => (day.rain_probability_pct = null));
      forecast.hourly.forEach((hour) => (hour.rain_probability_pct = null));
      return forecast;
    };
    renderApp('/', createMockDb({ user: null, publicForecast: noEnsemble }));

    const week = await screen.findByRole('list', { name: 'Próximos 7 días' });
    expect(within(week).getByText('12,4 mm')).toBeInTheDocument();
    expect(within(week).queryByText(/%/)).not.toBeInTheDocument();
    const hours = screen.getByRole('table', { name: 'Próximas horas' });
    expect(within(hours).queryByRole('rowheader', { name: /Probabilidad/ })).toBeNull();
    expect(within(hours).queryByText(/%/)).not.toBeInTheDocument();
  });

  it('asks to keep typing when a short search finds nothing yet', async () => {
    const { user } = renderApp('/buscar', createMockDb({ user: null }));

    await user.type(screen.getByRole('searchbox', { name: 'Buscar localidad o paraje' }), 'rosa');
    expect(await screen.findByText('Seguí escribiendo…')).toBeInTheDocument();
    expect(screen.getByText(/Open-Meteo\.com \(CC BY 4\.0\)/)).toBeInTheDocument();
  });

  it('sends an anonymous visitor from the Lotes tab to Ingresar', async () => {
    stubGeolocation(CASILDA);
    const { user } = renderApp('/', createMockDb({ user: null }));

    await screen.findByRole('heading', { level: 1, name: 'Casilda' });
    await user.click(screen.getByRole('link', { name: 'Lotes' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
  });
});
