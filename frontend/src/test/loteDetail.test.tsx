import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { demoForecast } from '../mocks/forecast';
import { CREDITS } from '../components/ForecastView';
import { http, HttpResponse } from 'msw';
import { renderApp } from './renderApp';
import { server } from './server';

describe('Lote detail', () => {
  it('shows the lote forecast with its decisions, and each model behind a disclosure', async () => {
    const { user } = renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Lote 4' })).toBeInTheDocument();
    const decisions = await screen.findByRole('region', { name: 'Hoy en este lote' });
    expect(
      within(decisions).getByText(
        'Noche despejada y calma: en el suelo puede bajar a −0,6 °C. 1 de 3 modelos da helada.',
      ),
    ).toBeInTheDocument();
    expect(within(decisions).getByText('Buena ventana de 10 a 13 h.')).toBeInTheDocument();
    expect(
      within(decisions).getByText(
        'Estimación con reglas publicadas; todavía sin validar en tu zona',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Próximas horas' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Próximos 7 días' })).toBeInTheDocument();

    await user.click(screen.getByText('Ver modelos'));
    const models = screen.getByRole('list', { name: 'Mínima por modelo' });
    expect(within(models).getByText('ECMWF')).toBeInTheDocument();
    expect(within(models).getByText('2,6 °C')).toBeInTheDocument();
    expect(within(models).getByText('GFS')).toBeInTheDocument();
    expect(within(models).getByText('3,8 °C')).toBeInTheDocument();
    expect(within(models).getByText('ICON')).toBeInTheDocument();
    expect(within(models).getByText('3,1 °C')).toBeInTheDocument();
    expect(within(decisions).getByText('Dan helada: 1 de 3 modelos')).toBeInTheDocument();
  });

  describe('as a decision board (lote-tablero)', () => {
    const titles = (region: HTMLElement) =>
      within(region)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent);
    const before = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('S2: puts the most urgent decision first, ties as frost, spraying, field work', async () => {
      const db = createMockDb({ user: demoUser, lotes: demoLotes() });
      const calm = demoForecast('sol');
      calm.decisions.field_work = {
        level: 'ok',
        next_rain: null,
        reason: 'No se esperan lluvias de 5 mm o más en los próximos 7 días.',
      };
      db.loteForecasts[7] = calm;
      const { unmount } = renderApp('/lotes/12', db);

      // Lote 12: only field work is "Ojo", so it goes first.
      expect(titles(await screen.findByRole('region', { name: 'Hoy en este lote' }))).toEqual([
        'Labores y siembra',
        'Helada esta noche',
        'Pulverizar hoy',
      ]);
      unmount();

      // Lote 4: frost and field work are both "Ojo": frost keeps its place before field work.
      const four = renderApp('/lotes/4', db);
      expect(titles(await screen.findByRole('region', { name: 'Hoy en este lote' }))).toEqual([
        'Helada esta noche',
        'Labores y siembra',
        'Pulverizar hoy',
      ]);
      four.unmount();

      // Everything fine: the plain order.
      renderApp('/lotes/7', db);
      expect(titles(await screen.findByRole('region', { name: 'Hoy en este lote' }))).toEqual([
        'Helada esta noche',
        'Pulverizar hoy',
        'Labores y siembra',
      ]);
    });

    it('S3: gives each decision its evidence, and the spray window only once', async () => {
      renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

      const decisions = await screen.findByRole('region', { name: 'Hoy en este lote' });
      expect(within(decisions).getAllByText(/10 a 13 h/)).toHaveLength(1);
      expect(within(decisions).queryByText('Mejor ventana')).toBeNull();
      // Wind and gusts over the window hours (10, 11 and 12 h).
      expect(within(decisions).getByText('viento 12–17 · ráfagas 24–33 km/h')).toBeInTheDocument();
      expect(within(decisions).getByText('cayeron 4,2 mm en 7 días')).toBeInTheDocument();
      // The 2 m figure is the median; the coldest model sits beside it.
      expect(
        within(decisions).getByText('suelo −0,6 °C · 2 m: mediana 3 °C · mín. modelo 2,6 °C'),
      ).toBeInTheDocument();
    });

    it('S2: says when the forecast was made, with its day, right under the lote', async () => {
      renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

      const stamp = await screen.findByText('Pronóstico mié 4 · 09:10 · 3 modelos');
      const decisions = screen.getByRole('region', { name: 'Hoy en este lote' });
      expect(before(screen.getByRole('heading', { level: 1, name: 'Lote 4' }), stamp)).toBe(true);
      expect(before(stamp, decisions)).toBe(true);
    });

    it('S2: keeps a compact header: crops with sowing date, hectares, place, one edit', async () => {
      renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

      expect(
        await screen.findByText('Soja (siembra 20/10) · Maíz · 120 ha · La Esperanza · Firmat'),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: 'Editar lote' })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Cambiar cultivos' })).toHaveLength(1);
    });

    it('S4: lists the hours with direction, humidity and the spraying state', async () => {
      const { user } = renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

      const table = await screen.findByRole('table', { name: 'Próximas horas' });
      for (const name of ['Pulverizar', 'Viento (km/h)', 'Humedad', 'Delta T', 'Causas']) {
        expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
      }
      const name = (hour: string) => new RegExp(`^${hour}\\sh$`);
      const row = (hour: string) =>
        within(table)
          .getByRole('rowheader', { name: name(hour) })
          .closest('tr')!;
      // 11 h is inside the window: marked in words, with its wind direction and humidity.
      expect(within(row('11')).getByText('Ventana')).toBeInTheDocument();
      expect(within(row('11')).getByText('SE 15')).toBeInTheDocument();
      expect(within(row('11')).getByText('51 %')).toBeInTheDocument();
      // 14 h: hot afternoon.
      expect(within(row('14')).getByText('Ojo')).toBeInTheDocument();
      expect(within(row('14')).getByText('Delta T alto')).toBeInTheDocument();
      // 22 h: a possible inversion.
      expect(within(row('22')).getByText('posible inversión térmica')).toBeInTheDocument();
      // A day of rows first; the second day on request.
      expect(within(table).getAllByRole('rowheader', { name: name('11') })).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Ver las 48 horas' }));
      expect(within(table).getAllByRole('rowheader', { name: name('11') })).toHaveLength(2);
    });

    it('S4: turns "Ahora" into one line with the sun times', async () => {
      renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

      const now = await screen.findByRole('region', { name: 'Ahora' });
      expect(now).toHaveTextContent(/Máx 27° · Mín 12°/);
      expect(now).toHaveTextContent('SE 12 km/h');
      expect(now).toHaveTextContent('Sale 06:04');
      expect(now).toHaveTextContent('Se pone 19:33');
      expect(screen.queryByRole('region', { name: 'Viento y humedad' })).toBeNull();
    });

    it('S5: folds the lote data and puts Histórico after the 7 days', async () => {
      const { user } = renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

      const week = await screen.findByRole('list', { name: 'Próximos 7 días' });
      const history = screen.getByRole('link', { name: /Histórico de clima y viento/ });
      const data = screen.getByText('Datos del lote');
      const credits = screen.getByText(CREDITS);
      expect(before(week, history)).toBe(true);
      expect(before(history, data)).toBe(true);
      expect(before(data, credits)).toBe(true);

      expect(screen.getByText('Superficie')).not.toBeVisible();
      await user.click(data);
      expect(screen.getByText('Superficie')).toBeVisible();
    });

    it('S5: leaves "Borrar lote" off the daily screen', async () => {
      renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

      await screen.findByRole('region', { name: 'Hoy en este lote' });
      expect(screen.queryByRole('button', { name: 'Borrar lote' })).toBeNull();
    });
  });

  describe('while the first forecast of a new lote is on its way (S12)', () => {
    const WAITING = 'Estamos buscando el pronóstico de este lote. Tarda unos segundos.';
    const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

    afterEach(() => {
      vi.useRealTimers();
    });

    it('waits and shows the forecast as soon as it arrives, without a tap', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const db = createMockDb({ user: demoUser, lotes: demoLotes() });
      renderApp('/lotes/7', db);

      expect(await screen.findByText(WAITING)).toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'Buscando el pronóstico' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Volver a intentar' })).toBeNull();

      db.loteForecasts[7] = demoForecast('sol');
      await wait(5_000);

      expect(await screen.findByRole('region', { name: 'Hoy en este lote' })).toBeInTheDocument();
      expect(screen.queryByText(WAITING)).toBeNull();
    });

    it('stops after about a minute and offers to try again', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const db = createMockDb({ user: demoUser, lotes: demoLotes() });
      const { user } = renderApp('/lotes/7', db);

      expect(await screen.findByText(WAITING)).toBeInTheDocument();
      await wait(30_000);
      expect(screen.getByText(WAITING)).toBeInTheDocument();
      await wait(35_000);

      const retry = await screen.findByRole('button', { name: 'Volver a intentar' });
      expect(screen.getByText('Todavía no llegó el pronóstico de este lote.')).toBeInTheDocument();
      expect(screen.queryByText(WAITING)).toBeNull();

      db.loteForecasts[7] = demoForecast('sol');
      await user.click(retry);
      expect(await screen.findByRole('region', { name: 'Hoy en este lote' })).toBeInTheDocument();
    });

    it('keeps the plain error for anything that is not a missing forecast', async () => {
      renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));
      // After renderApp: the handler added last wins.
      server.use(
        http.get('*/api/lotes/4/pronostico/', () =>
          HttpResponse.json({ detail: 'Algo salió mal.' }, { status: 400 }),
        ),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal.');
      expect(screen.queryByText(WAITING)).toBeNull();
    });
  });
});
