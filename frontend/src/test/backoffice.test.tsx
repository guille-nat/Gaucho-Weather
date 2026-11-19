import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { User } from '../api/types';
import { account, demoLotes, demoUser } from '../mocks/fixtures';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';

/** The backoffice for super admins (pagos-backoffice S6, with the S7 Pagos tab). */

const admin: User = { ...demoUser, is_superuser: true };
const farmer: User = account({ id: 9, email: 'f@x.com', name: 'Fermín', is_superuser: false });

const dbFor = (user: User | null, partial: Partial<MockDb> = {}) =>
  createMockDb({ user, lotes: demoLotes().slice(0, 1), ...partial });

const backofficeCalls = (db: MockDb) =>
  db.sent.filter((r) => r.path.startsWith('/api/backoffice/'));

async function openTab(user: ReturnType<typeof renderApp>['user'], name: string) {
  const tabs = await screen.findByRole('tablist', { name: 'Secciones del backoffice' });
  await user.click(within(tabs).getByRole('tab', { name }));
  return screen.findByRole('tabpanel', { name });
}

describe('Who reaches the backoffice', () => {
  it('sends a farmer back to Perfil without asking the backoffice API anything', async () => {
    const db = dbFor(farmer);
    renderApp('/backoffice', db);

    expect(await screen.findByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Backoffice' })).toBeNull();
    expect(backofficeCalls(db)).toEqual([]);
  });

  it('treats an account from before the flag as a farmer', async () => {
    // `account()` sets no flag, like a `me` persisted before it existed.
    const db = dbFor(account({ id: 10, email: 'o@x.com', name: 'Olga' }));
    renderApp('/backoffice', db);

    expect(await screen.findByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
    expect(backofficeCalls(db)).toEqual([]);
  });

  it('sends a visitor to log in', async () => {
    const db = dbFor(null);
    renderApp('/backoffice', db);

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(backofficeCalls(db)).toEqual([]);
  });

  it('links Perfil to it only for a super admin', async () => {
    const { user } = renderApp('/perfil', dbFor(admin));

    const section = await screen.findByRole('region', { name: 'Backoffice' });
    await user.click(within(section).getByRole('link', { name: 'Abrir el backoffice' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Backoffice' })).toBeVisible();
  });

  it('shows no link to a farmer', async () => {
    renderApp('/perfil', dbFor(farmer));
    await screen.findByRole('region', { name: 'Tu plan' });
    expect(screen.queryByRole('region', { name: 'Backoffice' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Abrir el backoffice' })).toBeNull();
  });

  it('keeps the session when the account stops being a super admin', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);
    await screen.findByRole('tabpanel', { name: 'Resumen' });

    // Demoted elsewhere: the next backoffice call is refused with 403.
    db.user = { ...admin, is_superuser: false };
    await openTab(user, 'Cuentas').catch(() => undefined);

    expect(await screen.findByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ingresar' })).toBeNull();
  });
});

describe('Backoffice tabs', () => {
  it('has the six tabs and opens on Resumen with the totals', async () => {
    const db = dbFor(admin);
    renderApp('/backoffice', db);

    const tabs = await screen.findByRole('tablist', { name: 'Secciones del backoffice' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Resumen', 'Cuentas', 'Pedidos', 'Pagos', 'Precios', 'Registro']);
    expect(within(tabs).getByRole('tab', { name: 'Resumen' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const panel = await screen.findByRole('tabpanel', { name: 'Resumen' });
    const figure = (label: string) =>
      within(panel).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    await within(panel).findByText('Cuentas en total', { selector: 'dt' });
    expect(figure('Cuentas en total')).toBe('3');
    expect(figure('Founders')).toBe('1');
    expect(figure('En prueba')).toBe('1');
    expect(figure('Activas en Básico')).toBe('1');
    expect(figure('Lugares de founder libres')).toBe('93');
    expect(figure('Altas en los últimos 30 días')).toBe('2');
    expect(figure('Pedidos pendientes')).toBe('1');
    expect(figure('Suscripciones activas')).toBe('1');
    expect(figure('Ingreso mensual')).toBe('$ 14.900');
    expect(figure('Pagos de este mes')).toBe('1');
    expect(figure('Cobrado este mes')).toBe('$ 14.900');
    expect(backofficeCalls(db).map((r) => r.path)).toEqual(['/api/backoffice/resumen/']);
  });

  it('lists accounts and filters them', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Cuentas');
    const table = await within(panel).findByRole('table', { name: 'Cuentas' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Marta Ríos');
    expect(rows[0]).toHaveTextContent('marta@sancayetano.com.ar');
    expect(rows[0]).toHaveTextContent('Básico');
    expect(rows[2]).toHaveTextContent('Founder n.º 7');
    expect(within(panel).getByText('3 cuentas')).toBeInTheDocument();

    await user.type(within(panel).getByLabelText('Buscar por nombre o email'), 'juan');
    await user.selectOptions(within(panel).getByLabelText('Estado'), 'trial');
    await user.click(within(panel).getByRole('button', { name: 'Buscar' }));

    await waitFor(() =>
      expect(
        within(panel)
          .getAllByRole('row')
          .slice(1)
          .map((r) => r.textContent),
      ).toEqual([expect.stringContaining('Juan Gómez')]),
    );
    expect(backofficeCalls(db).at(-1)?.path).toBe('/api/backoffice/cuentas/?q=juan&estado=trial');
  });

  it('changes an account’s plan with a note', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Cuentas');
    const table = await within(panel).findByRole('table', { name: 'Cuentas' });
    const marta = within(table).getByRole('row', { name: /Marta Ríos/ });
    await user.click(within(marta).getByRole('button', { name: 'Cambiar plan' }));

    const dialog = screen.getByRole('dialog', { name: 'Cambiar el plan de Marta Ríos' });
    await user.selectOptions(within(dialog).getByLabelText('Plan nuevo'), 'empresa');
    await user.type(within(dialog).getByLabelText('Nota (opcional)'), 'Pagó por transferencia');
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar plan' }));

    expect(await within(panel).findByText('Marta Ríos pasó al plan Empresa.')).toBeInTheDocument();
    expect(backofficeCalls(db).find((r) => r.method === 'POST')).toEqual({
      method: 'POST',
      path: '/api/backoffice/cuentas/22/plan/',
      body: { plan: 'empresa', note: 'Pagó por transferencia' },
    });
    expect(db.unsafeRequests.at(-1)).toMatchObject({
      path: '/api/backoffice/cuentas/22/plan/',
      csrf: db.csrfToken,
    });
    await waitFor(() =>
      expect(within(table).getByRole('row', { name: /Marta Ríos/ })).toHaveTextContent('Empresa'),
    );
  });

  it('shows a refused plan change as the API words it', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Cuentas');
    const table = await within(panel).findByRole('table', { name: 'Cuentas' });
    await user.click(
      within(within(table).getByRole('row', { name: /Marta Ríos/ })).getByRole('button', {
        name: 'Cambiar plan',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Cambiar el plan de Marta Ríos' });
    // Básico is her plan already.
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar plan' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'La cuenta ya está en el plan Básico.',
    );
  });

  it('applies and rejects plan requests', async () => {
    const db = dbFor(admin);
    db.backoffice.requests.push({
      id: 32,
      kind: 'cancel',
      plan: { code: 'basico', name: 'Básico' },
      status: 'pending',
      created_at: '2026-11-16T13:00:00Z',
      user: {
        id: 21,
        name: 'Juan Gómez',
        email: 'juan@elombu.com.ar',
        plan: { code: 'productor', name: 'Productor' },
        status: 'trial',
      },
    });
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Pedidos');
    const table = await within(panel).findByRole('table', { name: 'Pedidos pendientes' });
    const martaRow = within(table).getByRole('row', { name: /Marta Ríos/ });
    expect(martaRow).toHaveTextContent('Pasar a Empresa');
    expect(within(table).getByRole('row', { name: /Juan Gómez/ })).toHaveTextContent(
      'Baja a Básico',
    );
    await user.click(within(martaRow).getByRole('button', { name: 'Aplicar' }));

    expect(
      await within(panel).findByText('Aplicamos el pedido de Marta Ríos.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(table).queryByRole('row', { name: /Marta Ríos/ })).toBeNull(),
    );

    await user.click(
      within(within(table).getByRole('row', { name: /Juan Gómez/ })).getByRole('button', {
        name: 'Rechazar',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Rechazar el pedido de Juan Gómez' });
    await user.type(within(dialog).getByLabelText('Nota (opcional)'), 'Sigue en prueba');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar pedido' }));

    expect(
      await within(panel).findByText('Rechazamos el pedido de Juan Gómez.'),
    ).toBeInTheDocument();
    const posts = backofficeCalls(db).filter((r) => r.method === 'POST');
    expect(posts).toEqual([
      { method: 'POST', path: '/api/backoffice/pedidos/31/aplicar/', body: undefined },
      {
        method: 'POST',
        path: '/api/backoffice/pedidos/32/rechazar/',
        body: { note: 'Sigue en prueba' },
      },
    ]);
    expect(await within(panel).findByText('No hay pedidos pendientes.')).toBeInTheDocument();
  });

  it('lists payments and subscriptions (S7)', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Pagos');
    const payments = await within(panel).findByRole('table', { name: 'Pagos' });
    const [row] = within(payments).getAllByRole('row').slice(1);
    expect(row).toHaveTextContent('Juan Gómez');
    expect(row).toHaveTextContent('$ 14.900');
    expect(row).toHaveTextContent('Aprobado');
    expect(row).toHaveTextContent('1319000001');

    await user.click(within(panel).getByRole('button', { name: 'Suscripciones' }));
    const subs = await within(panel).findByRole('table', { name: 'Suscripciones' });
    const [sub] = within(subs).getAllByRole('row').slice(1);
    expect(sub).toHaveTextContent('Productor');
    expect(sub).toHaveTextContent('Activa');
    expect(sub).toHaveTextContent('3 de diciembre de 2026');
    expect(backofficeCalls(db).map((r) => r.path)).toEqual([
      '/api/backoffice/resumen/',
      '/api/backoffice/pagos/?tipo=pagos',
      '/api/backoffice/pagos/?tipo=suscripciones',
    ]);
  });

  it('updates both prices of a plan', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Precios');
    const productor = await within(panel).findByRole('group', { name: 'Productor' });
    const ars = within(productor).getByLabelText('Pesos por mes');
    const usd = within(productor).getByLabelText('Dólares por mes');
    expect(ars).toHaveValue('');
    await user.type(ars, '16500');
    await user.type(usd, '15');
    await user.click(within(productor).getByRole('button', { name: 'Guardar precios' }));

    expect(
      await within(productor).findByText('Precios de Productor guardados.'),
    ).toBeInTheDocument();
    expect(backofficeCalls(db).find((r) => r.method === 'PUT')).toEqual({
      method: 'PUT',
      path: '/api/backoffice/precios/productor/',
      body: { price_ars_month: 16500, price_usd_month: 15 },
    });
    expect(db.plans.find((p) => p.code === 'productor')).toMatchObject({
      price_ars_month: 16500,
      price_usd_month: 15,
    });
  });

  it('sends an empty price as "to confirm" and shows a field error', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Precios');
    const empresa = await within(panel).findByRole('group', { name: 'Empresa' });
    await user.type(within(empresa).getByLabelText('Pesos por mes'), '12,5');
    await user.click(within(empresa).getByRole('button', { name: 'Guardar precios' }));

    expect(
      await within(empresa).findByText('Usá un número entero, sin puntos ni comas.'),
    ).toBeInTheDocument();
    expect(backofficeCalls(db).some((r) => r.method === 'PUT')).toBe(false);

    await user.clear(within(empresa).getByLabelText('Pesos por mes'));
    await user.click(within(empresa).getByRole('button', { name: 'Guardar precios' }));
    expect(await within(empresa).findByText('Precios de Empresa guardados.')).toBeInTheDocument();
    expect(backofficeCalls(db).find((r) => r.method === 'PUT')?.body).toEqual({
      price_ars_month: null,
      price_usd_month: null,
    });
  });

  it('lists the log of backoffice actions in words', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Registro');
    const table = await within(panel).findByRole('table', { name: 'Registro' });
    const [row] = within(table).getAllByRole('row').slice(1);
    expect(row).toHaveTextContent('Ana Ferreyra');
    expect(row).toHaveTextContent('Precios de Productor: $ 13.900 → $ 14.900; US$ 10 → US$ 10');
    expect(backofficeCalls(db).at(-1)?.path).toBe('/api/backoffice/registro/');
  });

  it('remembers the open tab in the address', async () => {
    const db = dbFor(admin);
    renderApp('/backoffice?seccion=registro', db);

    const tabs = await screen.findByRole('tablist', { name: 'Secciones del backoffice' });
    expect(within(tabs).getByRole('tab', { name: 'Registro' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('table', { name: 'Registro' })).toBeInTheDocument();
  });
});
