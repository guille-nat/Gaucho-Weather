import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { User } from '../api/types';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';

/** avisos-cambios S4: scheduling and cancelling a price change from Precios. */

const admin: User = { ...demoUser, is_superuser: true };
const FAR = '2099-12-20';

const dbFor = (partial: Partial<MockDb> = {}) =>
  createMockDb({ user: admin, lotes: demoLotes().slice(0, 1), ...partial });

const calls = (db: MockDb, method: string) =>
  db.sent.filter((r) => r.method === method && r.path.includes('/cambio/'));

async function openPrecios(user: ReturnType<typeof renderApp>['user']) {
  const tabs = await screen.findByRole('tablist', { name: 'Secciones del backoffice' });
  await user.click(within(tabs).getByRole('tab', { name: 'Precios' }));
  return screen.findByRole('tabpanel', { name: 'Precios' });
}

function pending(db: MockDb) {
  db.backoffice.priceChanges.productor = {
    price_ars_month: 16900,
    effective_on: FAR,
    notices: 3,
    notices_sent: 2,
  };
  return db;
}

describe('Scheduled price changes (avisos-cambios S4)', () => {
  it('schedules a new peso price and shows it as pending', async () => {
    const db = dbFor();
    const { user } = renderApp('/backoffice', db);

    const panel = await openPrecios(user);
    const productor = await within(panel).findByRole('group', { name: 'Productor' });
    await user.click(within(productor).getByRole('button', { name: 'Programar un cambio' }));
    const dialog = screen.getByRole('dialog', { name: 'Programar un precio para Productor' });
    expect(dialog).toHaveTextContent('Les manda un email ahora');
    await user.type(within(dialog).getByLabelText('Pesos por mes, nuevo'), '16900');
    fireEvent.change(within(dialog).getByLabelText(/^Rige desde/), { target: { value: FAR } });
    await user.click(within(dialog).getByRole('button', { name: 'Programar y avisar' }));

    expect(
      await within(productor).findByText(/Desde el 20 de diciembre de 2099: \$\s16\.900 por mes/),
    ).toBeInTheDocument();
    expect(calls(db, 'POST')).toEqual([
      {
        method: 'POST',
        path: '/api/backoffice/precios/productor/cambio/',
        body: { price_ars_month: 16900, effective_on: FAR },
      },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows how many subscriptions were notified', async () => {
    const { user } = renderApp('/backoffice', pending(dbFor()));

    const panel = await openPrecios(user);
    const productor = await within(panel).findByRole('group', { name: 'Productor' });

    expect(productor).toHaveTextContent('Avisado a 2 de 3 suscripciones.');
    expect(
      within(productor).queryByRole('button', { name: 'Programar un cambio' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the dialog open with the API message for a date too soon', async () => {
    const db = dbFor();
    const { user } = renderApp('/backoffice', db);

    const panel = await openPrecios(user);
    const productor = await within(panel).findByRole('group', { name: 'Productor' });
    await user.click(within(productor).getByRole('button', { name: 'Programar un cambio' }));
    const dialog = screen.getByRole('dialog', { name: 'Programar un precio para Productor' });
    await user.type(within(dialog).getByLabelText('Pesos por mes, nuevo'), '16900');
    fireEvent.change(within(dialog).getByLabelText(/^Rige desde/), {
      target: { value: '2020-01-01' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Programar y avisar' }));

    expect(
      await within(dialog).findByText('La fecha tiene que ser al menos 30 días después de hoy.'),
    ).toBeVisible();
    expect(db.backoffice.priceChanges.productor).toBeUndefined();
  });

  it('checks the form before asking the API', async () => {
    const db = dbFor();
    const { user } = renderApp('/backoffice', db);

    const panel = await openPrecios(user);
    const productor = await within(panel).findByRole('group', { name: 'Productor' });
    await user.click(within(productor).getByRole('button', { name: 'Programar un cambio' }));
    const dialog = screen.getByRole('dialog', { name: 'Programar un precio para Productor' });
    await user.type(within(dialog).getByLabelText('Pesos por mes, nuevo'), '16.900');
    await user.click(within(dialog).getByRole('button', { name: 'Programar y avisar' }));

    expect(
      within(dialog).getByText('Usá un número entero mayor que 0, sin puntos ni comas.'),
    ).toBeVisible();
    expect(within(dialog).getByText('Elegí una fecha.')).toBeVisible();
    expect(calls(db, 'POST')).toEqual([]);
  });

  it('cancels a pending change behind a confirmation', async () => {
    const db = pending(dbFor());
    const { user } = renderApp('/backoffice', db);

    const panel = await openPrecios(user);
    const productor = await within(panel).findByRole('group', { name: 'Productor' });
    await user.click(within(productor).getByRole('button', { name: 'Cancelar el cambio' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancelar el cambio de Productor' });
    expect(within(dialog).getByRole('button', { name: 'Volver' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar el cambio' }));

    expect(
      await within(productor).findByRole('button', { name: 'Programar un cambio' }),
    ).toBeInTheDocument();
    expect(calls(db, 'DELETE').map((r) => r.path)).toEqual([
      '/api/backoffice/precios/productor/cambio/',
    ]);
    expect(db.backoffice.priceChanges.productor).toBeUndefined();
  });

  it('offers no scheduled price for Básico', async () => {
    const { user } = renderApp('/backoffice', dbFor());

    const panel = await openPrecios(user);
    const basico = await within(panel).findByRole('group', { name: 'Básico' });

    expect(
      within(basico).queryByRole('button', { name: 'Programar un cambio' }),
    ).not.toBeInTheDocument();
  });

  it('describes scheduling and cancelling in the log', async () => {
    const db = dbFor();
    db.backoffice.actions = [
      {
        id: 2,
        action: 'price_unschedule',
        actor: { id: 1, name: 'Ana Ferreyra', email: 'ana@example.com' },
        target_user: null,
        payload: { plan: 'productor', price_ars_month: 16900, effective_on: FAR },
        at: '2026-11-20T12:05:00Z',
      },
      {
        id: 1,
        action: 'price_schedule',
        actor: { id: 1, name: 'Ana Ferreyra', email: 'ana@example.com' },
        target_user: null,
        payload: { plan: 'productor', price_ars_month: 16900, effective_on: FAR },
        at: '2026-11-20T12:00:00Z',
      },
    ];
    const { user } = renderApp('/backoffice', db);

    const tabs = await screen.findByRole('tablist', { name: 'Secciones del backoffice' });
    await user.click(within(tabs).getByRole('tab', { name: 'Registro' }));
    const table = await screen.findByRole('table', { name: 'Registro' });
    const [cancelled, scheduled] = within(table).getAllByRole('row').slice(1);

    expect(scheduled).toHaveTextContent(
      /Cambio de precio programado: Productor a \$\s16\.900 desde el 20 de diciembre de 2099/,
    );
    expect(cancelled).toHaveTextContent(
      /Cambio de precio cancelado: Productor a \$\s16\.900 desde el 20 de diciembre de 2099/,
    );
  });
});
