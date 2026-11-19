import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Payment, PlanChange, ProviderSubscription, User } from '../api/types';
import { account, demoLotes, demoPlans, demoUser, planOf } from '../mocks/fixtures';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';

/** Pagos con Mercado Pago en Tu suscripción (pagos-backoffice S5, S6). */

const ROUTE = '/perfil/suscripcion';

const priced = demoPlans.map((plan) =>
  plan.code === 'basico'
    ? { ...plan, price_ars_month: 0, price_usd_month: 0 }
    : plan.code === 'productor'
      ? { ...plan, price_ars_month: 14900, price_usd_month: 10 }
      : { ...plan, price_ars_month: 49900, price_usd_month: 35 },
);

const basicoUser = account({ id: 4, email: 'b@x.com', name: 'Beto', plan: planOf('basico') });
const productorUser = account({ id: 5, email: 'p@x.com', name: 'Pía' });
const trialUser = account({
  id: 6,
  email: 't@x.com',
  name: 'Tito',
  plan_expires_at: new Date(Date.now() + 12 * 86_400_000 - 60_000).toISOString(),
});

const authorized: ProviderSubscription = {
  id: 61,
  plan: 'productor',
  plan_name: 'Productor',
  provider: 'mercadopago',
  currency: 'ARS',
  amount: 14900,
  status: 'authorized',
  next_payment_at: '2026-12-19T15:00:00Z',
  ends_at: null,
  created_at: '2026-11-19T15:00:00Z',
};

const payments: Payment[] = [
  {
    id: 2,
    amount: 14900,
    currency: 'ARS',
    status: 'rejected',
    paid_at: null,
    created_at: '2026-11-18T15:00:00Z',
  },
  {
    id: 1,
    amount: 14900,
    currency: 'ARS',
    status: 'approved',
    paid_at: '2026-10-19T15:00:00Z',
    created_at: '2026-10-19T14:58:00Z',
  },
];

const dbFor = (user: User, partial: Partial<MockDb> = {}) =>
  createMockDb({
    user,
    lotes: demoLotes().slice(0, 1),
    plans: priced,
    paymentsEnabled: true,
    ...partial,
  });

const region = (name: string) => screen.findByRole('region', { name });

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

const sentTo = (db: MockDb, path: string) => db.sent.filter((r) => r.path === path);

describe('Suscribirse con Mercado Pago (S6)', () => {
  it('posts the plan in pesos and goes to the Mercado Pago checkout', async () => {
    const assign = stubLocation();
    const db = dbFor(basicoUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    expect(
      within(change).getByText('Pagás en pesos con Mercado Pago, todos los meses.'),
    ).toBeInTheDocument();
    expect(within(change).queryByText(/Todavía no cobramos online/)).toBeNull();
    const productor = within(change).getByRole('article', { name: 'Plan Productor' });
    await user.click(within(productor).getByRole('button', { name: 'Suscribirme' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(db.checkoutUrl));
    expect(sentTo(db, '/api/pagos/suscribirme/')).toEqual([
      {
        method: 'POST',
        path: '/api/pagos/suscribirme/',
        body: { plan: 'productor', currency: 'ARS' },
      },
    ]);
    expect(db.unsafeRequests.at(-1)).toMatchObject({
      path: '/api/pagos/suscribirme/',
      csrf: db.csrfToken,
    });
    // The manual request flow is not used for a payment.
    expect(db.planRequest).toBeNull();
  });

  it('says dollars are coming soon instead of offering to subscribe (S5)', async () => {
    const db = dbFor(basicoUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    await user.click(
      within(within(change).getByRole('group', { name: 'Moneda' })).getByRole('button', {
        name: 'Dólares',
      }),
    );

    const productor = within(change).getByRole('article', { name: 'Plan Productor' });
    expect(within(productor).getByText('US$ 10')).toBeInTheDocument();
    expect(
      within(productor).getByRole('button', { name: 'Pagar en dólares: próximamente' }),
    ).toBeDisabled();
    expect(within(change).queryByRole('button', { name: 'Suscribirme' })).toBeNull();
    expect(sentTo(db, '/api/pagos/suscribirme/')).toEqual([]);
  });

  it('keeps the request to the team when payments are off', async () => {
    const db = dbFor(basicoUser, { paymentsEnabled: false });
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    expect(
      within(change).getByText(
        'Todavía no cobramos online: el equipo aplica tu pedido a mano y te avisa por email.',
      ),
    ).toBeInTheDocument();
    expect(within(change).queryByRole('button', { name: 'Suscribirme' })).toBeNull();
    // Dollars too: nothing is paid online yet, so there is nothing "coming soon" to single out.
    await user.click(within(change).getByRole('button', { name: 'Dólares' }));
    expect(within(change).queryByText('Pagar en dólares: próximamente')).toBeNull();
    const productor = within(change).getByRole('article', { name: 'Plan Productor' });
    await user.click(within(productor).getByRole('button', { name: 'Pedir este plan' }));

    expect(await region('Pedido pendiente')).toBeInTheDocument();
    expect(db.planRequest).toMatchObject({ kind: 'change', plan: 'productor' });
  });

  it('lets a trial subscribe to the plan it is trying', async () => {
    const assign = stubLocation();
    const db = dbFor(trialUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    const productor = within(change).getByRole('article', { name: 'Plan Productor' });
    expect(within(productor).queryByRole('button', { name: /Quedarme con/ })).toBeNull();
    await user.click(within(productor).getByRole('button', { name: 'Suscribirme' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(db.checkoutUrl));
    expect(sentTo(db, '/api/pagos/suscribirme/')[0]?.body).toEqual({
      plan: 'productor',
      currency: 'ARS',
    });
  });

  it('leaves a founder on the request flow: the plan is already free', async () => {
    renderApp(ROUTE, dbFor(demoUser));

    const change = await region('Cambiar de plan');
    expect(within(change).queryByRole('button', { name: 'Suscribirme' })).toBeNull();
    const empresa = within(change).getByRole('article', { name: 'Plan Empresa' });
    expect(within(empresa).getByRole('button', { name: 'Pedir este plan' })).toBeEnabled();
  });

  it('shows a refusal as the API words it', async () => {
    const assign = stubLocation();
    const plans = priced.map((p) => (p.code === 'empresa' ? { ...p, price_ars_month: null } : p));
    const { user } = renderApp(ROUTE, dbFor(basicoUser, { plans }));

    const change = await region('Cambiar de plan');
    const empresa = within(change).getByRole('article', { name: 'Plan Empresa' });
    await user.click(within(empresa).getByRole('button', { name: 'Suscribirme' }));

    expect(await within(change).findByRole('alert')).toHaveTextContent(
      'Ese plan todavía no tiene precio en pesos.',
    );
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('Vuelta de Mercado Pago (S6)', () => {
  it.each([
    [
      'ok',
      'Listo: Mercado Pago está procesando tu suscripción. Tu plan cambia apenas lo confirme.',
    ],
    [
      'pendiente',
      'Tu pago quedó pendiente en Mercado Pago. Cuando se acredite, tu plan cambia solo.',
    ],
    ['error', 'El pago no se completó en Mercado Pago. Podés intentarlo de nuevo.'],
  ])('shows a notice for ?pago=%s', async (pago, text) => {
    renderApp(`${ROUTE}?pago=${pago}`, dbFor(basicoUser));

    const notice = await screen.findByText(text);
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });

  it('shows no notice without ?pago', async () => {
    renderApp(ROUTE, dbFor(basicoUser));
    await region('Cambiar de plan');
    expect(screen.queryByText(/Mercado Pago está procesando/)).toBeNull();
    expect(screen.queryByText(/pendiente en Mercado Pago/)).toBeNull();
  });
});

describe('Darse de baja (S6)', () => {
  it('cancels at Mercado Pago when the account pays there, keeping the paid month', async () => {
    const db = dbFor(productorUser, { providerSubscription: authorized });
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    await user.click(within(change).getByRole('button', { name: 'Darme de baja' }));
    const confirm = within(change).getByRole('dialog', { name: '¿Darte de baja de Productor?' });
    expect(
      within(confirm).getByText(
        'Seguís con Productor hasta el 19 de diciembre de 2026, el mes que ya pagaste. Después pasás a Básico y no te cobramos más.',
      ),
    ).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Sí, darme de baja' }));

    expect(
      await screen.findByText(
        'Te diste de baja. Seguís con Productor hasta el 19 de diciembre de 2026.',
      ),
    ).toBeInTheDocument();
    expect(sentTo(db, '/api/pagos/cancelar/')).toEqual([
      { method: 'POST', path: '/api/pagos/cancelar/', body: undefined },
    ]);
    expect(db.providerSubscription?.status).toBe('cancelled');
    // Not the request to the team.
    expect(db.planRequest).toBeNull();
    expect(db.unsafeRequests.some((r) => r.path === '/api/auth/suscripcion/pedido/')).toBe(false);
    // Nothing left to cancel: the plan ends on its own.
    expect(within(change).queryByRole('button', { name: 'Darme de baja' })).toBeNull();
    const payments = await region('Tus pagos');
    expect(within(payments).getByText('Cancelada')).toBeInTheDocument();
    expect(within(payments).getByText('Termina el 19 de diciembre de 2026')).toBeInTheDocument();
  });

  it('asks the team for the baja when there is no Mercado Pago subscription', async () => {
    const db = dbFor(productorUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    await user.click(within(change).getByRole('button', { name: 'Darme de baja' }));
    await user.click(screen.getByRole('button', { name: 'Sí, pedir la baja' }));

    const pending = await region('Pedido pendiente');
    expect(within(pending).getByText('Pediste pasar al plan Básico.')).toBeInTheDocument();
    expect(db.planRequest).toMatchObject({ kind: 'cancel', plan: 'basico' });
    expect(sentTo(db, '/api/pagos/cancelar/')).toEqual([]);
  });
});

describe('Historial de pagos (S6)', () => {
  it('lists the subscription and every payment, newest first', async () => {
    renderApp(ROUTE, dbFor(productorUser, { providerSubscription: authorized, payments }));

    const section = await region('Tus pagos');
    expect(within(section).getByText('Activa')).toBeInTheDocument();
    expect(within(section).getByText('$ 14.900 / mes con Mercado Pago')).toBeInTheDocument();
    expect(
      within(section).getByText('Próximo cobro el 19 de diciembre de 2026'),
    ).toBeInTheDocument();
    const list = within(section).getByRole('list', { name: 'Pagos' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('18 de noviembre de 2026');
    expect(items[0]).toHaveTextContent('$ 14.900');
    expect(items[0]).toHaveTextContent('Rechazado');
    expect(items[1]).toHaveTextContent('19 de octubre de 2026');
    expect(items[1]).toHaveTextContent('Aprobado');
  });

  it('says so when there are no payments yet', async () => {
    renderApp(ROUTE, dbFor(basicoUser));

    const section = await region('Tus pagos');
    expect(within(section).getByText('Todavía no hay pagos.')).toBeInTheDocument();
  });

  it('words the plan changes a payment makes', async () => {
    const history: PlanChange[] = [
      {
        at: '2026-11-19T15:00:00Z',
        from_plan: { code: 'productor', name: 'Productor' },
        to_plan: { code: 'basico', name: 'Básico' },
        reason: 'payment_ended',
      },
      {
        at: '2026-10-19T15:00:00Z',
        from_plan: { code: 'basico', name: 'Básico' },
        to_plan: { code: 'productor', name: 'Productor' },
        reason: 'payment',
      },
    ];
    renderApp(ROUTE, dbFor(basicoUser, { planHistory: history }));

    const list = await screen.findByRole('list', { name: 'Cambios de plan' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.timeline-title')?.textContent),
    ).toEqual(['Terminó tu suscripción', 'Se aprobó tu pago']);
  });
});
