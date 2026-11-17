import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AlertRule, User } from '../api/types';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { account, demoLotes } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const ROUTE = '/perfil/suscripcion';

const productor = account({ id: 11, email: 'p@x.com', name: 'Pía', founder_number: null });
const trialUser = account({
  id: 12,
  email: 't@x.com',
  name: 'Tito',
  founder_number: null,
  plan_expires_at: new Date(Date.now() + 12 * 86_400_000 - 60_000).toISOString(),
});

const lotes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...demoLotes()[0]!, id: 100 + i, name: `Lote ${i}` }));

const rules = (n: number): AlertRule[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    lote: 100,
    lote_name: 'Lote 0',
    variable: 'frost',
    comparator: null,
    threshold: null,
    enabled: true,
    paused_by_plan: false,
    description: 'Helada en Lote 0',
    created_at: '2026-11-01T12:00:00Z',
  }));

const dbFor = (user: User, partial: Partial<MockDb> = {}) =>
  createMockDb({ user, lotes: lotes(1), ...partial });

async function openCancel(user: ReturnType<typeof renderApp>['user'], label: string) {
  const change = await screen.findByRole('region', { name: 'Cambiar de plan' });
  await user.click(within(change).getByRole('button', { name: label }));
  return change;
}

describe('Cancel during a trial (perfil-ux S9)', () => {
  it('says the trial ends now instead of offering to cancel a plan never paid for', async () => {
    const { user } = renderApp(ROUTE, dbFor(trialUser));

    const change = await openCancel(user, 'Terminar la prueba ahora');
    expect(within(change).queryByRole('button', { name: 'Darme de baja' })).toBeNull();
    const confirm = within(change).getByRole('group', {
      name: '¿Terminar la prueba y pasar a Básico?',
    });
    expect(
      within(confirm).getByText('La prueba termina ahora, sin esperar al último día.'),
    ).toBeInTheDocument();
    expect(within(confirm).getByRole('button', { name: 'Sí, terminar la prueba' })).toBeVisible();
  });

  it('lists what is lost from the account’s own numbers', async () => {
    const { user } = renderApp(ROUTE, dbFor(productor, { lotes: lotes(5), alertRules: rules(4) }));

    const change = await openCancel(user, 'Darme de baja');
    const confirm = within(change).getByRole('group', { name: '¿Pasar al plan Básico?' });
    expect(
      within(confirm).getByText(
        'Tenés 5 lotes y Básico permite 2: quedan todos, pero no vas a poder crear nuevos.',
      ),
    ).toBeInTheDocument();
    expect(
      within(confirm).getByText(
        'Tenés 4 reglas de alerta y Básico permite 3: se pausan las que pasan de 3.',
      ),
    ).toBeInTheDocument();
  });

  it('does not list a limit the account already fits in', async () => {
    const { user } = renderApp(ROUTE, dbFor(productor, { alertRules: rules(1) }));

    const change = await openCancel(user, 'Darme de baja');
    const confirm = within(change).getByRole('group', { name: '¿Pasar al plan Básico?' });
    expect(within(confirm).queryByText(/^Tenés/)).toBeNull();
    expect(
      within(confirm).getByText(
        'No vas a recibir notificaciones push: te avisamos por email y en la app.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Focus in the cancel confirm (perfil-ux S8)', () => {
  it('moves focus into the question, and back to the button on Mejor no', async () => {
    const { user } = renderApp(ROUTE, dbFor(productor));

    const change = await openCancel(user, 'Darme de baja');
    expect(document.activeElement).toHaveTextContent('¿Pasar al plan Básico?');

    await user.click(within(change).getByRole('button', { name: 'Mejor no' }));
    expect(document.activeElement).toBe(
      within(change).getByRole('button', { name: 'Darme de baja' }),
    );
  });

  it('moves focus to the pending request once the request is sent', async () => {
    const { user } = renderApp(ROUTE, dbFor(productor));

    const change = await openCancel(user, 'Darme de baja');
    await user.click(within(change).getByRole('button', { name: 'Sí, pedir la baja' }));

    const pending = await screen.findByRole('region', { name: 'Pedido pendiente' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(within(pending).getByRole('heading'));
  });
});
