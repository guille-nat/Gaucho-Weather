import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AlertRule, PlanChange, User } from '../api/types';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { account, demoLotes, demoUser, planOf } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const ROUTE = '/perfil/suscripcion';

const trialUser = account({
  id: 3,
  email: 'c@x.com',
  name: 'Carla Paz',
  plan_expires_at: new Date(Date.now() + 12 * 86_400_000 - 60_000).toISOString(),
});

const basicoUser = account({ id: 4, email: 'b@x.com', name: 'Beto', plan: planOf('basico') });

const rule = (id: number): AlertRule => ({
  id,
  lote: 12,
  lote_name: 'Lote 12',
  variable: 'frost',
  comparator: null,
  threshold: null,
  enabled: true,
  paused_by_plan: false,
  description: 'Helada en Lote 12',
  created_at: '2026-11-01T12:00:00Z',
});

const dbFor = (user: User, partial: Partial<MockDb> = {}) =>
  createMockDb({ user, lotes: demoLotes().slice(0, 1), ...partial });

const region = (name: string) => screen.findByRole('region', { name });

describe('Tu suscripción (cuenta-planes-alertas S14)', () => {
  it('is reached from Perfil and from Planes', async () => {
    const { user } = renderApp('/perfil', dbFor(demoUser));

    const plan = await region('Tu plan');
    await user.click(within(plan).getByRole('link', { name: 'Tu suscripción' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Tu suscripción' })).toBeVisible();
  });

  it('links Planes to it only for someone logged in', async () => {
    renderApp('/planes', dbFor(demoUser));
    expect(await screen.findByRole('link', { name: 'Administrar suscripción' })).toHaveAttribute(
      'href',
      ROUTE,
    );
  });

  it('shows a founder’s plan, badge, what it includes and its usage', async () => {
    renderApp(ROUTE, dbFor(demoUser, { alertRules: [rule(1), rule(2)] }));

    const plan = await region('Tu plan');
    expect(within(plan).getByText('Productor')).toBeInTheDocument();
    expect(within(plan).getByText('Founder n.º 7')).toBeInTheDocument();
    expect(within(plan).getByText('Notificaciones push')).toBeInTheDocument();
    expect(within(plan).getByText('1 de 15 lotes')).toBeInTheDocument();
    expect(within(plan).getByText('2 reglas de alerta, sin límite')).toBeInTheDocument();
    // Each limit once, with its usage (perfil-ux S11).
    expect(within(plan).queryByText('Hasta 15 lotes')).toBeNull();
    expect(within(plan).queryByText('Reglas de alerta sin límite')).toBeNull();
    expect(within(plan).getAllByRole('list')).toHaveLength(1);
  });

  it('tells a founder the whole story on the page, without inventing benefits', async () => {
    renderApp(ROUTE, dbFor(demoUser));

    const story = await region('Sos founder');
    expect(
      within(story).getByText(
        'Sos founder n.º 7: una de las primeras 100 personas que confiaron en Gaucho Weather.',
      ),
    ).toBeInTheDocument();
    expect(
      within(story).getByText('Tenés el plan Productor gratis para siempre.'),
    ).toBeInTheDocument();
    expect(
      within(story).getByText('El n.º 7 es tuyo para siempre: nadie más lo va a tener.'),
    ).toBeInTheDocument();
    expect(
      within(story).getByText(
        'Gracias por ayudarnos a construir Gaucho Weather desde el principio.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a trial with its days left and no founder badge', async () => {
    renderApp(ROUTE, dbFor(trialUser));

    const plan = await region('Tu plan');
    expect(within(plan).getByText('Prueba: te quedan 12 días')).toBeInTheDocument();
    expect(screen.queryByText(/Founder n\.º/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Sos founder' })).toBeNull();
  });

  it('shows an active Básico with its limits and what it lacks', async () => {
    renderApp(ROUTE, dbFor(basicoUser, { alertRules: [rule(1)] }));

    const plan = await region('Tu plan');
    expect(within(plan).getByText('Básico')).toBeInTheDocument();
    expect(within(plan).getByText('Activo')).toBeInTheDocument();
    expect(within(plan).getByText('Sin notificaciones push')).toBeInTheDocument();
    expect(within(plan).getByText('1 de 2 lotes')).toBeInTheDocument();
    expect(within(plan).getByText('1 de 3 reglas de alerta')).toBeInTheDocument();
    // Básico has nothing to cancel down to.
    expect(screen.queryByRole('button', { name: 'Darme de baja' })).toBeNull();
  });

  it('lets a trial ask to keep Productor after the trial', async () => {
    const db = dbFor(trialUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    await user.click(await within(change).findByRole('button', { name: 'Quedarme con Productor' }));

    expect(await region('Pedido pendiente')).toBeInTheDocument();
    expect(db.planRequest).toMatchObject({ kind: 'change', plan: 'productor' });
  });

  it('offers no "keep" option outside a trial', async () => {
    renderApp(ROUTE, dbFor(demoUser));

    const change = await region('Cambiar de plan');
    expect(within(change).queryByRole('button', { name: /Quedarme con/ })).toBeNull();
  });

  it('asks for another plan and shows the request as pending', async () => {
    const db = dbFor(demoUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    expect(
      within(change).getByText(
        'Todavía no cobramos online: el equipo aplica tu pedido a mano y te avisa por email.',
      ),
    ).toBeInTheDocument();
    expect(within(change).queryByRole('article', { name: 'Plan Productor' })).toBeNull();
    const empresa = await within(change).findByRole('article', { name: 'Plan Empresa' });
    await user.click(within(empresa).getByRole('button', { name: 'Pedir este plan' }));

    const pending = await region('Pedido pendiente');
    expect(within(pending).getByText('Pediste pasar al plan Empresa.')).toBeInTheDocument();
    expect(db.planRequest).toMatchObject({ kind: 'change', plan: 'empresa' });
    expect(within(empresa).getByRole('button', { name: 'Pedir este plan' })).toBeDisabled();
    expect(db.unsafeRequests.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/auth/suscripcion/pedido/',
    });
  });

  it('withdraws a pending request', async () => {
    const db = dbFor(demoUser, {
      planRequest: { id: 5, kind: 'change', plan: 'empresa', created_at: '2026-11-15T13:00:00Z' },
    });
    const { user } = renderApp(ROUTE, db);

    const pending = await region('Pedido pendiente');
    expect(within(pending).getByText('Pediste pasar al plan Empresa.')).toBeInTheDocument();
    await user.click(within(pending).getByRole('button', { name: 'Retirar pedido' }));

    expect(await screen.findByText('Retiramos tu pedido.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pedido pendiente' })).toBeNull();
    expect(db.planRequest).toBeNull();
    expect(db.unsafeRequests.at(-1)).toMatchObject({ method: 'DELETE' });
  });

  it('cancels down to Básico only after saying what is kept and what is lost', async () => {
    const db = dbFor(demoUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    await user.click(within(change).getByRole('button', { name: 'Darme de baja' }));
    const confirm = within(change).getByRole('group', { name: '¿Pasar al plan Básico?' });
    expect(
      within(confirm).getByText('Seguís con el pronóstico, tus lotes, tus reglas y el histórico.'),
    ).toBeInTheDocument();
    // One lote and no rules fit in Básico: only what really changes is listed (perfil-ux S9).
    expect(within(confirm).queryByText(/^Tenés/)).toBeNull();
    expect(
      within(confirm).getByText(
        'No vas a recibir notificaciones push: te avisamos por email y en la app.',
      ),
    ).toBeInTheDocument();

    await user.click(within(confirm).getByRole('button', { name: 'Mejor no' }));
    expect(within(change).queryByRole('group')).toBeNull();
    expect(db.planRequest).toBeNull();

    await user.click(within(change).getByRole('button', { name: 'Darme de baja' }));
    await user.click(screen.getByRole('button', { name: 'Sí, pedir la baja' }));

    const pending = await region('Pedido pendiente');
    expect(within(pending).getByText('Pediste pasar al plan Básico.')).toBeInTheDocument();
    expect(db.planRequest).toMatchObject({ kind: 'cancel', plan: 'basico' });
  });

  it('shows the API’s reason when a request is refused', async () => {
    const db = dbFor(demoUser);
    const { user } = renderApp(ROUTE, db);

    const change = await region('Cambiar de plan');
    // Another phone asked first: this screen does not know yet.
    db.planRequest = { id: 9, kind: 'cancel', plan: null, created_at: '2026-11-16T10:00:00Z' };
    const empresa = await within(change).findByRole('article', { name: 'Plan Empresa' });
    await user.click(within(empresa).getByRole('button', { name: 'Pedir este plan' }));

    expect(await within(change).findByRole('alert')).toHaveTextContent(
      'Ya tenés un pedido pendiente.',
    );
  });

  it('lists the plan history newest first, with words for every reason', async () => {
    const history: PlanChange[] = [
      {
        at: '2026-11-14T15:00:00Z',
        from_plan: { code: 'productor', name: 'Productor' },
        to_plan: { code: 'empresa', name: 'Empresa' },
        reason: 'staff',
      },
      {
        at: '2026-11-10T15:00:00Z',
        from_plan: { code: 'basico', name: 'Básico' },
        to_plan: { code: 'productor', name: 'Productor' },
        reason: 'request',
      },
      {
        at: '2026-11-01T15:00:00Z',
        from_plan: { code: 'productor', name: 'Productor' },
        to_plan: { code: 'basico', name: 'Básico' },
        reason: 'trial_ended',
      },
      {
        at: '2026-10-02T15:00:00Z',
        from_plan: null,
        to_plan: { code: 'productor', name: 'Productor' },
        reason: 'trial',
      },
      {
        at: '2026-09-02T15:00:00Z',
        from_plan: null,
        to_plan: { code: 'productor', name: 'Productor' },
        reason: 'founder',
      },
    ];
    renderApp(ROUTE, dbFor(demoUser, { planHistory: history }));

    const list = await screen.findByRole('list', { name: 'Cambios de plan' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.timeline-title')?.textContent)).toEqual([
      'Cambio hecho por el equipo',
      'Se aplicó tu pedido',
      'Terminó la prueba',
      'Empezó tu prueba de Productor',
      'Te sumaste como founder',
    ]);
    expect(within(items[0]!).getByText('Productor → Empresa')).toBeInTheDocument();
    expect(within(items[0]!).getByText('14 de noviembre de 2026')).toBeInTheDocument();
    expect(within(items[4]!).getByText('Productor')).toBeInTheDocument();
  });

  it('needs an account', async () => {
    renderApp(ROUTE, createMockDb());
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
  });
});
