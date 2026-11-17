import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { account, demoPlans, demoUser, planOf } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const card = (name: string) => screen.getByRole('article', { name: `Plan ${name}` });

describe('Planes (S1, S8)', () => {
  it('shows the three plans with Productor first, the most chosen', async () => {
    renderApp('/planes', createMockDb());

    expect(await screen.findByRole('heading', { name: 'Planes' })).toBeInTheDocument();
    const names = (await screen.findAllByRole('article')).map((el) =>
      el.getAttribute('aria-label'),
    );
    // The most chosen first (phones show it first); wide screens put it in the middle column.
    expect(names).toEqual(['Plan Productor', 'Plan Básico', 'Plan Empresa']);
    expect(within(card('Productor')).getByText('El más elegido')).toBeInTheDocument();
    expect(within(card('Básico')).queryByText('El más elegido')).toBeNull();
    expect(within(card('Empresa')).queryByText('El más elegido')).toBeNull();
  });

  it('lists what each plan includes, with Básico showing it has no push', async () => {
    renderApp('/planes', createMockDb());

    const basico = await screen.findByRole('article', { name: 'Plan Básico' });
    expect(within(basico).getByText('Hasta 2 lotes')).toBeInTheDocument();
    expect(within(basico).getByText('Hasta 3 reglas de alerta')).toBeInTheDocument();
    expect(within(basico).getByText('Sin notificaciones push')).toBeInTheDocument();
    expect(within(card('Productor')).getByText('Hasta 15 lotes')).toBeInTheDocument();
    expect(within(card('Productor')).getByText('Reglas de alerta sin límite')).toBeInTheDocument();
    expect(within(card('Productor')).getByText('Notificaciones push')).toBeInTheDocument();
    expect(within(card('Empresa')).getByText('Lotes sin límite')).toBeInTheDocument();
    expect(within(card('Empresa')).getByText('Soporte prioritario')).toBeInTheDocument();
  });

  it('shows a plan priced at zero as free, not as $ 0 a month', async () => {
    const plans = demoPlans.map((p) => (p.code === 'basico' ? { ...p, price_ars_month: 0 } : p));
    renderApp('/planes', createMockDb({ plans }));

    const basico = await screen.findByRole('article', { name: 'Plan Básico' });
    expect(within(basico).getByText('Gratis')).toBeInTheDocument();
    expect(within(basico).queryByText(/\$ 0/)).toBeNull();
    expect(within(basico).queryByText(/mes/)).toBeNull();
  });

  it('says the price is to be confirmed until it is set, and formats it when it is', async () => {
    const plans = demoPlans.map((p) =>
      p.code === 'productor' ? { ...p, price_ars_month: 4500 } : p,
    );
    renderApp('/planes', createMockDb({ plans }));

    expect(
      await within(await screen.findByRole('article', { name: 'Plan Productor' })).findByText(
        '$ 4.500',
      ),
    ).toBeInTheDocument();
    expect(within(card('Básico')).getByText('Precio a confirmar')).toBeInTheDocument();
  });

  it('invites a visitor to try Productor free for the trial days', async () => {
    renderApp('/planes', createMockDb({ user: null }));

    const productor = await screen.findByRole('article', { name: 'Plan Productor' });
    expect(within(productor).getByText('Probalo 30 días gratis')).toBeInTheDocument();
    expect(within(productor).getByRole('link', { name: 'Crear cuenta gratis' })).toBeVisible();
  });

  it('counts the founder slots left', async () => {
    renderApp('/planes', createMockDb({ founders: { limit: 100, remaining: 37 } }));

    expect(
      await screen.findByText('Quedan 37 lugares de founder: Productor gratis para siempre.'),
    ).toBeInTheDocument();
  });

  it('marks a founder’s plan and number', async () => {
    renderApp('/planes', createMockDb({ user: demoUser }));

    const productor = await screen.findByRole('article', { name: 'Plan Productor' });
    expect(within(productor).getByText('Tu plan')).toBeInTheDocument();
    expect(within(productor).getByText('Founder n.º 7 · gratis para siempre')).toBeInTheDocument();
  });

  it('tells a trial account how many days it has left', async () => {
    const expires = new Date(Date.now() + 12 * 86_400_000 - 60_000).toISOString();
    const trial = account({ id: 3, email: 'c@x.com', name: 'C', plan_expires_at: expires });
    renderApp('/planes', createMockDb({ user: trial }));

    const productor = await screen.findByRole('article', { name: 'Plan Productor' });
    expect(within(productor).getByText('Prueba: te quedan 12 días')).toBeInTheDocument();
  });

  it('offers no checkout yet', async () => {
    const basico = account({ id: 4, email: 'b@x.com', name: 'B', plan: planOf('basico') });
    renderApp('/planes', createMockDb({ user: basico }));

    const empresa = await screen.findByRole('article', { name: 'Plan Empresa' });
    expect(within(empresa).getByRole('button', { name: 'Próximamente' })).toBeDisabled();
    expect(within(card('Básico')).getByText('Tu plan')).toBeInTheDocument();
  });
});
