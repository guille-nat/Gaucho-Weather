import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Plan, ProviderSubscription, User } from '../api/types';
import { account, demoLotes, demoPlans, demoUser, planOf } from '../mocks/fixtures';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';

/** A founder moving up to Empresa pays only the difference (odd/tasks/promociones.md SF4, SF5). */

const ROUTE = '/perfil/suscripcion';

const pricedAt = (productor: number | null, empresa: number | null): Plan[] =>
  demoPlans.map((plan) =>
    plan.code === 'basico'
      ? { ...plan, price_ars_month: 0 }
      : { ...plan, price_ars_month: plan.code === 'productor' ? productor : empresa },
  );

const priced = pricedAt(14900, 49900);

const dbFor = (user: User, partial: Partial<MockDb> = {}) =>
  createMockDb({
    user,
    lotes: demoLotes().slice(0, 1),
    plans: priced,
    paymentsEnabled: true,
    ...partial,
  });

const region = (name: string) => screen.findByRole('region', { name });
const sentTo = (db: MockDb, path: string) => db.sent.filter((r) => r.path === path);

/** jsdom cannot leave the page: stand in for `location.assign` and keep the origin. */
function stubLocation() {
  const assign = vi.fn();
  const { origin, href, pathname, search, hash, host, hostname, protocol, port } = window.location;
  vi.stubGlobal('location', {
    origin,
    href,
    pathname,
    search,
    hash,
    host,
    hostname,
    protocol,
    port,
    assign,
  });
  return assign;
}

describe('Planes for a founder (SF5)', () => {
  const card = (name: string) => screen.getByRole('article', { name: `Plan ${name}` });

  it('offers Empresa with the difference the API prices, and nothing else', async () => {
    renderApp('/planes', createMockDb({ user: demoUser, plans: priced, paymentsEnabled: true }));

    const empresa = await screen.findByRole('article', { name: 'Plan Empresa' });
    expect(within(empresa).getByRole('link', { name: 'Suscribirme' })).toHaveAttribute(
      'href',
      '/perfil/suscripcion',
    );
    expect(
      within(empresa).getByText('Como founder pagás solo la diferencia: $35.000 por mes.'),
    ).toBeInTheDocument();
    expect(within(card('Productor')).queryByRole('link', { name: 'Suscribirme' })).toBeNull();
    expect(within(card('Básico')).queryByRole('link', { name: 'Suscribirme' })).toBeNull();
  });

  it('takes the amount from the prices, not from a fixed number', async () => {
    renderApp(
      '/planes',
      createMockDb({ user: demoUser, plans: pricedAt(20000, 60000), paymentsEnabled: true }),
    );

    const empresa = await screen.findByRole('article', { name: 'Plan Empresa' });
    expect(
      within(empresa).getByText('Como founder pagás solo la diferencia: $40.000 por mes.'),
    ).toBeInTheDocument();
  });

  it('tells no difference to someone who is not a founder', async () => {
    const basico = account({ id: 4, email: 'b@x.com', name: 'B', plan: planOf('basico') });
    renderApp('/planes', createMockDb({ user: basico, plans: priced, paymentsEnabled: true }));

    await screen.findByRole('article', { name: 'Plan Empresa' });
    expect(screen.queryByText(/Como founder pagás/)).toBeNull();
  });
});

describe('Suscripción for a founder (SF5)', () => {
  it('subscribes a founder to Empresa at the difference', async () => {
    const assign = stubLocation();
    const db = dbFor(demoUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    const empresa = within(change).getByRole('article', { name: 'Plan Empresa' });
    expect(
      within(empresa).getByText('Como founder pagás solo la diferencia: $35.000 por mes.'),
    ).toBeInTheDocument();
    for (const name of ['Productor', 'Básico']) {
      const other = within(change).getByRole('article', { name: `Plan ${name}` });
      expect(within(other).queryByRole('button', { name: 'Suscribirme' })).toBeNull();
    }
    await user.click(within(empresa).getByRole('button', { name: 'Suscribirme' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(db.checkoutUrl));
    expect(sentTo(db, '/api/pagos/suscribirme/').map((r) => r.body)).toEqual([
      { plan: 'empresa', currency: 'ARS' },
    ]);
    expect(db.planRequest).toBeNull();
  });

  it('shows the API’s refusal when the difference has no price', async () => {
    const assign = stubLocation();
    const { user } = renderApp(ROUTE, dbFor(demoUser, { plans: pricedAt(49900, 49900) }));

    const change = await region('Cambiar de plan');
    const empresa = within(change).getByRole('article', { name: 'Plan Empresa' });
    expect(within(empresa).queryByText(/Como founder pagás/)).toBeNull();
    await user.click(within(empresa).getByRole('button', { name: 'Suscribirme' }));

    expect(await within(change).findByRole('alert')).toHaveTextContent(
      'Ese plan todavía no tiene precio en pesos.',
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('refuses a founder’s request for Empresa while payments are off', async () => {
    const db = dbFor(demoUser, { paymentsEnabled: false });
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    const empresa = within(change).getByRole('article', { name: 'Plan Empresa' });
    await user.click(within(empresa).getByRole('button', { name: 'Pedir este plan' }));

    expect(await within(change).findByRole('alert')).toHaveTextContent(
      'Como founder, Empresa se paga con Mercado Pago: pagás solo la diferencia.',
    );
    expect(db.planRequest).toBeNull();
  });

  it('tells a founder paying Empresa that the baja goes back to Productor', async () => {
    const paying: ProviderSubscription = {
      id: 61,
      plan: 'empresa',
      plan_name: 'Empresa',
      provider: 'mercadopago',
      currency: 'ARS',
      amount: 35000,
      status: 'authorized',
      next_payment_at: '2026-12-19T15:00:00Z',
      ends_at: null,
      created_at: '2026-11-19T15:00:00Z',
    };
    const founderOnEmpresa = { ...demoUser, plan: planOf('empresa') };
    const { user } = renderApp(ROUTE, dbFor(founderOnEmpresa, { providerSubscription: paying }));

    const change = await region('Cambiar de plan');
    for (const name of ['Productor', 'Básico']) {
      const other = within(change).getByRole('article', { name: `Plan ${name}` });
      expect(within(other).queryByRole('button', { name: 'Suscribirme' })).toBeNull();
    }
    expect(await screen.findByText('$ 35.000 / mes con Mercado Pago')).toBeInTheDocument();
    await user.click(within(change).getByRole('button', { name: 'Darme de baja' }));

    const dialog = screen.getByRole('dialog', { name: '¿Darte de baja de Empresa?' });
    expect(
      within(dialog).getByText(
        'Seguís con Empresa hasta el 19 de diciembre de 2026, el mes que ya pagaste. Después pasás a Productor y no te cobramos más.',
      ),
    ).toBeInTheDocument();
  });
});

describe('The backoffice never gives a founder Empresa (SF4)', () => {
  const admin: User = { ...demoUser, is_superuser: true };

  async function openTab(user: ReturnType<typeof renderApp>['user'], name: string) {
    const tabs = await screen.findByRole('tablist', { name: 'Secciones del backoffice' });
    await user.click(within(tabs).getByRole('tab', { name }));
    return screen.findByRole('tabpanel', { name });
  }

  it('refuses to move a founder to Empresa, as the API words it', async () => {
    const db = createMockDb({ user: admin });
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Cuentas');
    const table = await within(panel).findByRole('table', { name: 'Cuentas' });
    await user.click(
      within(within(table).getByRole('row', { name: /Ana Ferreyra/ })).getByRole('button', {
        name: 'Cambiar plan',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Cambiar el plan de Ana Ferreyra' });
    await user.selectOptions(within(dialog).getByLabelText('Plan nuevo'), 'empresa');
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar plan' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Como founder, Empresa se paga con Mercado Pago: pagás solo la diferencia.',
    );
    expect(db.backoffice.accounts.find((a) => a.id === 1)?.plan.code).toBe('productor');
    expect(db.backoffice.actions.some((a) => a.action === 'plan_change')).toBe(false);
  });

  it('refuses to apply a founder’s request for Empresa and keeps it pending', async () => {
    const db = createMockDb({ user: admin });
    db.backoffice.requests = [
      {
        id: 40,
        kind: 'change',
        plan: { code: 'empresa', name: 'Empresa' },
        status: 'pending',
        created_at: '2026-11-16T13:00:00Z',
        user: {
          id: 1,
          name: 'Ana Ferreyra',
          email: 'ana@lacampana.com.ar',
          plan: { code: 'productor', name: 'Productor' },
          status: 'founder',
        },
      },
    ];
    const { user } = renderApp('/backoffice', db);

    const panel = await openTab(user, 'Pedidos');
    const table = await within(panel).findByRole('table', { name: 'Pedidos pendientes' });
    await user.click(
      within(within(table).getByRole('row', { name: /Ana Ferreyra/ })).getByRole('button', {
        name: 'Aplicar',
      }),
    );

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Como founder, Empresa se paga con Mercado Pago: pagás solo la diferencia.',
    );
    expect(db.backoffice.requests[0]?.status).toBe('pending');
    expect(db.backoffice.actions.some((a) => a.action === 'request_apply')).toBe(false);
  });
});
