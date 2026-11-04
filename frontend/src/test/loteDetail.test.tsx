import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { renderApp } from './renderApp';

describe('Lote detail', () => {
  it('shows tonight minimum honestly, with the value of each model', async () => {
    renderApp('/lotes/4', createMockDb({ user: demoUser, lotes: demoLotes() }));

    expect(await screen.findByRole('heading', { name: 'Lote 4' })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            'Mínima esta noche a 2 m: 3 °C · pronóstico, no es todavía un aviso de helada',
      ),
    ).toBeInTheDocument();

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
      screen.getByText('Estamos juntando el primer pronóstico de este lote'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Mínima esta noche/)).not.toBeInTheDocument();
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
