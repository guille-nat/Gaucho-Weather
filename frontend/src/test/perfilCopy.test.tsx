import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { User } from '../api/types';
import { createMockDb } from '../mocks/handlers';
import { account, demoLotes, demoUser } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const notFounder = account({ id: 5, email: 'd@x.com', name: 'Dora', founder_number: null });

const dbFor = (user: User) =>
  createMockDb({
    user,
    accounts: [{ email: user.email, password: 'pampa-humeda-2026', user }],
    lotes: demoLotes().slice(0, 1),
  });

const FOUNDER_SEAT = 'Si sos founder, tu lugar no vuelve a quedar libre.';

describe('Founder and plan copy (perfil-ux S5)', () => {
  it('tells only a founder that their seat is not handed out again', async () => {
    const { user } = renderApp('/perfil', dbFor(notFounder));
    const borrar = await screen.findByRole('region', { name: 'Borrar cuenta' });
    await user.click(within(borrar).getByText('Quiero borrar mi cuenta'));

    expect(
      within(borrar).getByText(
        'Borramos tu cuenta, tus lotes y tus alertas. No se puede deshacer.',
      ),
    ).toBeInTheDocument();
    expect(within(borrar).queryByText(FOUNDER_SEAT, { exact: false })).not.toBeInTheDocument();
  });

  it('tells a founder that deleting gives up founder n.º N for good', async () => {
    const { user } = renderApp('/perfil', dbFor(demoUser));
    const borrar = await screen.findByRole('region', { name: 'Borrar cuenta' });
    await user.click(within(borrar).getByText('Quiero borrar mi cuenta'));

    expect(
      within(borrar).getByText('Dejás de ser founder n.º 7, y ese lugar no se le da a nadie más.'),
    ).toBeInTheDocument();
  });

  it('tells a founder moving down that they stay a founder and can come back', async () => {
    const { user } = renderApp('/perfil/suscripcion', dbFor(demoUser));
    const change = await screen.findByRole('region', { name: 'Cambiar de plan' });
    await user.click(within(change).getByRole('button', { name: 'Darme de baja' }));

    const confirm = within(change).getByRole('group', { name: '¿Pasar al plan Básico?' });
    expect(
      within(confirm).getByText(
        'Seguís siendo founder n.º 7: si después querés volver a Productor, lo pedís desde acá.',
      ),
    ).toBeInTheDocument();
  });

  it('does not talk about founders to someone moving down who is not one', async () => {
    const { user } = renderApp('/perfil/suscripcion', dbFor(notFounder));
    const change = await screen.findByRole('region', { name: 'Cambiar de plan' });
    await user.click(within(change).getByRole('button', { name: 'Darme de baja' }));

    const confirm = within(change).getByRole('group', { name: '¿Pasar al plan Básico?' });
    expect(within(confirm).queryByText(/founder/)).not.toBeInTheDocument();
  });

  it('says the price comes by email before the request is applied when a plan has none', async () => {
    renderApp('/perfil/suscripcion', dbFor(notFounder));
    const empresa = await screen.findByRole('article', { name: 'Plan Empresa' });

    expect(
      within(empresa).getByText(
        'Precio a confirmar: te lo pasamos por email antes de aplicar el pedido.',
      ),
    ).toBeInTheDocument();
  });

  it('names the two plan links by what each one does', async () => {
    renderApp('/perfil', dbFor(demoUser));
    const plan = await screen.findByRole('region', { name: 'Tu plan' });

    expect(within(plan).getByRole('link', { name: 'Tu suscripción' })).toHaveAttribute(
      'href',
      '/perfil/suscripcion',
    );
    expect(within(plan).getByRole('link', { name: 'Comparar planes' })).toHaveAttribute(
      'href',
      '/planes',
    );
  });

  it('says on Perfil what happens when the trial ends (perfil-ux S10)', async () => {
    const trial = account({
      id: 6,
      email: 't@x.com',
      name: 'Tito',
      founder_number: null,
      plan_expires_at: new Date(Date.now() + 12 * 86_400_000 - 60_000).toISOString(),
    });
    renderApp('/perfil', dbFor(trial));
    const plan = await screen.findByRole('region', { name: 'Tu plan' });

    expect(within(plan).getByText('Prueba: te quedan 12 días').closest('.chip')).not.toBeNull();
    expect(within(plan).getByText('Cuando termine pasás a Básico.')).toBeInTheDocument();
  });

  it('does not talk about a trial ending to someone without one (perfil-ux S10)', async () => {
    renderApp('/perfil', dbFor(notFounder));
    const plan = await screen.findByRole('region', { name: 'Tu plan' });

    expect(within(plan).queryByText('Cuando termine pasás a Básico.')).toBeNull();
  });
});
