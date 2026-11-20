import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryDay, HistoryHour, LoteHistory } from '../api/types';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { createMockDb } from '../mocks/handlers';
import { HISTORY_ATTRIBUTION } from '../mocks/history';
import { renderApp } from './renderApp';

const day = (
  date: string,
  values: [number | null, number | null, number | null, number | null, number | null],
  hours = 24,
  audit: [number | null, number | null, number | null] = [null, null, null],
): HistoryDay => {
  const [temp_max_c, temp_min_c, rain_mm, wind_max_kmh, gust_max_kmh] = values;
  const [humidity_min_pct, delta_t_max_c, inversion_hours] = audit;
  return {
    date,
    temp_max_c,
    temp_min_c,
    rain_mm,
    wind_max_kmh,
    gust_max_kmh,
    humidity_min_pct,
    delta_t_max_c,
    inversion_hours,
    hours,
  };
};

const hour = (time: string, fields: Partial<HistoryHour>): HistoryHour => ({
  time,
  temperature_c: 24,
  humidity_pct: 60,
  rain_mm: 0,
  wind_kmh: 10,
  wind_dir_deg: 0,
  gust_kmh: 18,
  spray_wind: 'ok',
  spray_wind_causes: [],
  temperature_80m_c: 22,
  wet_bulb_c: 18,
  cloud_cover_pct: 20,
  pressure_hpa: 1012,
  radiation_wm2: 500,
  delta_t_c: 6,
  inversion: false,
  ...fields,
});

/** The last 7 days up to Monday 2026-11-16, with a day the provider left empty. */
const lastWeek: LoteHistory = {
  from: '2026-11-10',
  to: '2026-11-16',
  source: 'open-meteo/historical-forecast',
  attribution: HISTORY_ATTRIBUTION,
  complete: true,
  days: [
    day('2026-11-10', [28.4, 12.1, 0, 14.2, 25.3]),
    day('2026-11-11', [26, 11.5, 0, 12, 20]),
    day('2026-11-12', [null, null, null, null, null], 0),
    day('2026-11-13', [27, 13, 0, 10, 18]),
    day('2026-11-14', [29, 14, 0, 11, 19]),
    day('2026-11-15', [31.2, 16.8, 4.5, 22.6, 41], 24, [38, 9.4, 3]),
    day('2026-11-16', [25, 15, 0, 9, 15], 1),
  ],
  hours: [
    hour('2026-11-15T09:00:00-03:00', {
      wind_kmh: 12.4,
      gust_kmh: 19.6,
      wind_dir_deg: 45,
      temperature_c: 22.5,
      humidity_pct: 71,
      delta_t_c: 3.2,
      inversion: true,
    }),
    hour('2026-11-15T15:00:00-03:00', {
      wind_kmh: 22.6,
      gust_kmh: 41,
      wind_dir_deg: 180,
      rain_mm: 1.2,
      spray_wind: 'critical',
      spray_wind_causes: ['mucho viento', 'ráfagas fuertes'],
    }),
    hour('2026-11-15T20:00:00-03:00', {
      wind_kmh: 3,
      gust_kmh: 6,
      wind_dir_deg: 270,
      spray_wind: 'caution',
      spray_wind_causes: ['poco viento'],
    }),
    hour('2026-11-15T21:00:00-03:00', {
      wind_kmh: null,
      gust_kmh: null,
      wind_dir_deg: null,
      spray_wind: null,
      delta_t_c: null,
      inversion: null,
    }),
    hour('2026-11-16T08:00:00-03:00', { wind_kmh: 9 }),
  ],
};

const signedIn = (extra: Parameters<typeof createMockDb>[0] = {}) =>
  createMockDb({ user: demoUser, lotes: demoLotes(), ...extra });

describe('Lote history (S9, S10)', () => {
  beforeEach(() => {
    // 15:00 UTC is noon of Monday 2026-11-16 in Argentina.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 16, 15, 0));
  });

  it('opens from the lote page', async () => {
    const { user } = renderApp('/lotes/4', signedIn());

    await user.click(await screen.findByRole('link', { name: /Histórico de clima y viento/ }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Histórico de clima y viento' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lote 4' })).toHaveAttribute('href', '/lotes/4');
  });

  it('summarises the last 7 days by default, with a dash where there is no data', async () => {
    const db = signedIn({ loteHistory: () => lastWeek });
    renderApp('/lotes/4/historico', db);

    const table = await screen.findByRole('table', { name: 'Resumen diario' });
    expect(db.historyRequests).toEqual([{ id: 4, desde: '2026-11-10', hasta: '2026-11-16' }]);
    expect(screen.getByRole('button', { name: 'Últimos 7 días' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-11-10');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-11-16');

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(headers).toEqual([
      'Día',
      'Máx',
      'Mín',
      'Lluvia',
      'Viento máx',
      'Ráfaga máx',
      'Humedad mín',
      'Delta T máx',
      'Horas con inversión',
    ]);
    // One row per day, plus the header.
    expect(within(table).getAllByRole('row')).toHaveLength(8);

    const rainy = within(table).getByRole('row', { name: /15\/11/ });
    const cells = within(rainy)
      .getAllByRole('cell')
      .map((td) => td.textContent?.replace(/\u00a0/g, ' '));
    expect(cells).toEqual([
      '31,2 °C',
      '16,8 °C',
      '4,5 mm',
      '23 km/h',
      '41 km/h',
      '38 %',
      '9,4 °C',
      '3 h',
    ]);

    const empty = within(table).getByRole('row', { name: /12\/11/ });
    expect(
      within(empty)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    ).toEqual(['—', '—', '—', '—', '—', '—', '—', '—']);
  });

  it('asks for the last 30 days when chosen', async () => {
    const db = signedIn();
    const { user } = renderApp('/lotes/4/historico', db);
    await screen.findByRole('table', { name: 'Resumen diario' });

    await user.click(screen.getByRole('button', { name: 'Últimos 30 días' }));

    const table = await screen.findByRole('table', { name: 'Resumen diario' });
    await vi.waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(31));
    expect(db.historyRequests.at(-1)).toEqual({ id: 4, desde: '2026-10-18', hasta: '2026-11-16' });
    expect(screen.getByRole('button', { name: 'Últimos 30 días' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-18');
  });

  it('lists the hours of a chosen day with wind, gust, direction and the spray range', async () => {
    const { user } = renderApp('/lotes/4/historico', signedIn({ loteHistory: () => lastWeek }));
    await screen.findByRole('table', { name: 'Resumen diario' });

    await user.selectOptions(screen.getByLabelText('Día'), '2026-11-15');

    const hours = screen.getByRole('list', { name: /Viento hora por hora/ });
    const items = within(hours).getAllByRole('listitem');
    expect(items).toHaveLength(4);

    const [morning, afternoon, evening, gap] = items as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(within(morning).getByText('9 h')).toBeInTheDocument();
    expect(within(morning).getByText('12 km/h')).toBeInTheDocument();
    expect(within(morning).getByText('20 km/h')).toBeInTheDocument();
    expect(within(morning).getByText('NE')).toBeInTheDocument();
    expect(within(morning).getByText('22,5 °C')).toBeInTheDocument();
    expect(within(morning).getByText('71 %')).toBeInTheDocument();
    expect(within(morning).getByText('Apto')).toBeInTheDocument();

    expect(within(afternoon).getByText('S')).toBeInTheDocument();
    expect(within(afternoon).getByText('1,2 mm')).toBeInTheDocument();
    expect(within(afternoon).getByText('No apto')).toBeInTheDocument();
    expect(within(afternoon).getByText('Mucho viento, ráfagas fuertes')).toBeInTheDocument();

    expect(within(evening).getByText('O')).toBeInTheDocument();
    expect(within(evening).getByText('Con cuidado')).toBeInTheDocument();
    expect(within(evening).getByText('Poco viento')).toBeInTheDocument();

    expect(within(gap).getByText('Sin dato')).toBeInTheDocument();
  });

  it('adds humidity, Delta T and an inversion mark to each hour (S4)', async () => {
    const { user } = renderApp('/lotes/4/historico', signedIn({ loteHistory: () => lastWeek }));
    await screen.findByRole('table', { name: 'Resumen diario' });

    await user.selectOptions(screen.getByLabelText('Día'), '2026-11-15');

    const items = within(screen.getByRole('list', { name: /Viento hora por hora/ })).getAllByRole(
      'listitem',
    );
    const [morning, afternoon, , gap] = items as HTMLElement[] as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    const fact = (item: HTMLElement, term: string) =>
      within(item).getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;

    expect(fact(morning, 'Humedad')).toBe('71\u00a0%');
    expect(fact(morning, 'Delta T')).toBe('3,2\u00a0°C');
    expect(fact(morning, 'Inversión térmica')).toBe('Hay inversión');
    // An icon plus a word, never colour alone.
    expect(within(morning).getByText('Hay inversión').querySelector('svg')).not.toBeNull();
    expect(fact(afternoon, 'Delta T')).toBe('6\u00a0°C');
    expect(fact(afternoon, 'Inversión térmica')).toBe('Sin inversión');
    expect(within(afternoon).getByText('Sin inversión').querySelector('svg')).not.toBeNull();
    expect(fact(gap, 'Delta T')).toBe('—');
    expect(fact(gap, 'Inversión térmica')).toBe('—');
    // The existing facts stay.
    expect(
      within(morning)
        .getAllByRole('term')
        .map((dt) => dt.textContent),
    ).toEqual([
      'Viento',
      'Ráfaga',
      'Dirección',
      'Humedad',
      'Delta T',
      'Inversión térmica',
      'Temperatura',
      'Lluvia',
    ]);
  });

  it('explains Delta T and the inversion in the help text', async () => {
    renderApp('/lotes/4/historico', signedIn({ loteHistory: () => lastWeek }));
    await screen.findByRole('table', { name: 'Resumen diario' });

    expect(screen.getByText(/Delta T: temperatura menos bulbo húmedo/)).toBeInTheDocument();
    expect(screen.getByText(/más calor a 80 m que a 2 m/)).toBeInTheDocument();
  });

  it('opens on the latest day with hours', async () => {
    renderApp('/lotes/4/historico', signedIn({ loteHistory: () => lastWeek }));
    await screen.findByRole('table', { name: 'Resumen diario' });

    expect(screen.getByLabelText('Día')).toHaveValue('2026-11-16');
    const hours = screen.getByRole('list', { name: /Viento hora por hora/ });
    expect(within(hours).getAllByRole('listitem')).toHaveLength(1);
  });

  it('shows why the server refused a range', async () => {
    const db = signedIn();
    const { user } = renderApp('/lotes/4/historico', db);
    await screen.findByRole('table', { name: 'Resumen diario' });

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Ver período' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí hasta 31 días.');
    expect(db.historyRequests.at(-1)).toEqual({ id: 4, desde: '2026-01-01', hasta: '2026-11-16' });
    expect(screen.queryByRole('button', { name: 'Últimos 7 días' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('says the history is still loading when it is incomplete', async () => {
    renderApp(
      '/lotes/4/historico',
      signedIn({ loteHistory: () => ({ ...lastWeek, complete: false }) }),
    );

    expect(
      await screen.findByText(
        'Todavía estamos cargando el historial de este lote. Probá de nuevo en unos minutos.',
      ),
    ).toBeInTheDocument();
  });

  it('says the data is modelled, not measured on the lote', async () => {
    renderApp('/lotes/4/historico', signedIn({ loteHistory: () => lastWeek }));

    expect(await screen.findByText(HISTORY_ATTRIBUTION)).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Todavía estamos cargando el historial de este lote. Probá de nuevo en unos minutos.',
      ),
    ).not.toBeInTheDocument();
  });

  it("does not show another user's lote", async () => {
    renderApp('/lotes/999/historico', signedIn());

    expect(await screen.findByText('No encontramos ese lote.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Resumen diario' })).not.toBeInTheDocument();
  });
});
