import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { renderApp } from './renderApp';

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

  it('says the first forecast is on its way when there is no summary yet', async () => {
    renderApp('/lotes/7', createMockDb({ user: demoUser, lotes: demoLotes() }));

    expect(await screen.findByRole('heading', { name: 'Lote 7' })).toBeInTheDocument();
    expect(
      await screen.findByText('Estamos juntando el primer pronóstico de este lote'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decisiones para este lote' })).toBeNull();
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
