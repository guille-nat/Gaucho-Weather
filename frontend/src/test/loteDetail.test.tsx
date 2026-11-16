import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { demoForecast } from '../mocks/forecast';
import { http, HttpResponse } from 'msw';
import { renderApp } from './renderApp';
import { server } from './server';

describe('Lote detail', () => {
  it('shows the lote forecast with its decisions, and each model behind a disclosure', async () => {
    const { user } = renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Lote 4' })).toBeInTheDocument();
    const decisions = await screen.findByRole('region', { name: 'Decisiones para este lote' });
    expect(
      within(decisions).getByText(
        'Noche despejada y calma: en el suelo puede bajar a −0,6 °C. 1 de 3 modelos da helada.',
      ),
    ).toBeInTheDocument();
    expect(within(decisions).getByText('1 de 3 modelos')).toBeInTheDocument();
    expect(within(decisions).getByText('Buena ventana de 10 a 13 h.')).toBeInTheDocument();
    expect(
      within(decisions).getByText(
        'Estimación con reglas publicadas; todavía sin validar en tu zona',
      ),
    ).toBeInTheDocument();
    // The same weather blocks as Inicio.
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

      expect(
        await screen.findByRole('region', { name: 'Decisiones para este lote' }),
      ).toBeInTheDocument();
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
      expect(
        await screen.findByRole('region', { name: 'Decisiones para este lote' }),
      ).toBeInTheDocument();
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

  it('deletes the lote after confirming', async () => {
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/lotes/7', db);

    await user.click(await screen.findByRole('button', { name: 'Borrar lote' }));
    await user.click(screen.getByRole('button', { name: 'Sí, borrar' }));

    expect(await screen.findByRole('heading', { name: 'Mis lotes' })).toBeInTheDocument();
    expect(db.lotes.map((l) => l.id)).toEqual([12, 4]);
  });
});
