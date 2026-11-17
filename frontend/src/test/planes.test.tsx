import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { account, demoPlans, demoUser, planOf } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const card = (name: string) => screen.getByRole('article', { name: `Plan ${name}` });

/** The plans with the prices decided on 2026-11-17, in pesos and in dollars (precios-productor L8, L9). */
const pricedPlans = demoPlans.map((p) => ({
  ...p,
  price_ars_month: { basico: 0, productor: 14900, empresa: 49900 }[p.code],
  price_usd_month: { basico: 0, productor: 10, empresa: 35 }[p.code],
}));

/** A price paragraph by its whole text, amount and period together. */
const priceLine = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'P' && el.textContent === text;

const currency = () => screen.findByRole('group', { name: 'Moneda' });

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

  it('keeps showing the peso price with its period while pesos are chosen', async () => {
    renderApp('/planes', createMockDb({ plans: pricedPlans }));

    const productor = await screen.findByRole('article', { name: 'Plan Productor' });
    expect(within(productor).getByText(priceLine('$ 14.900 / mes'))).toBeInTheDocument();
    expect(within(card('Empresa')).getByText(priceLine('$ 49.900 / mes'))).toBeInTheDocument();
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

describe('Planes in pesos or dollars (precios-productor S5)', () => {
  it('starts in pesos', async () => {
    renderApp('/planes', createMockDb({ plans: pricedPlans }));

    const choice = await currency();
    expect(within(choice).getByRole('button', { name: 'Pesos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(choice).getByRole('button', { name: 'Dólares' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(card('Productor')).getByText('$ 14.900')).toBeInTheDocument();
  });

  it('switches every card to dollars', async () => {
    const { user } = renderApp('/planes', createMockDb({ plans: pricedPlans }));

    await user.click(within(await currency()).getByRole('button', { name: 'Dólares' }));

    expect(screen.getByRole('button', { name: 'Dólares' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pesos' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(card('Productor')).getByText('US$ 10')).toBeInTheDocument();
    expect(within(card('Empresa')).getByText('US$ 35')).toBeInTheDocument();
    expect(within(card('Básico')).getByText('Gratis')).toBeInTheDocument();
    expect(screen.queryByText('$ 14.900')).toBeNull();
    expect(screen.queryByText('$ 49.900')).toBeNull();
  });

  it('remembers the chosen currency on this device', async () => {
    const first = renderApp('/planes', createMockDb({ plans: pricedPlans }));
    await first.user.click(within(await currency()).getByRole('button', { name: 'Dólares' }));
    first.unmount();

    renderApp('/planes', createMockDb({ plans: pricedPlans }));

    expect(within(await currency()).getByRole('button', { name: 'Dólares' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(card('Productor')).getByText('US$ 10')).toBeInTheDocument();
  });

  it('writes a dollar price as "US$ N / mes"', async () => {
    const { user } = renderApp('/planes', createMockDb({ plans: pricedPlans }));

    await user.click(within(await currency()).getByRole('button', { name: 'Dólares' }));

    expect(within(card('Productor')).getByText(priceLine('US$ 10 / mes'))).toBeInTheDocument();
  });

  it('shows a plan priced at zero dollars as free', async () => {
    // No peso price, so "Gratis" can only come from the dollar price.
    const plans = demoPlans.map((p) => (p.code === 'basico' ? { ...p, price_usd_month: 0 } : p));
    const { user } = renderApp('/planes', createMockDb({ plans }));

    await user.click(within(await currency()).getByRole('button', { name: 'Dólares' }));

    expect(within(card('Básico')).getByText('Gratis')).toBeInTheDocument();
    expect(within(card('Básico')).queryByText(/US\$ 0/)).toBeNull();
  });

  it('says the price is to be confirmed when the plan has no dollar price', async () => {
    const plans = demoPlans.map((p) =>
      p.code === 'productor' ? { ...p, price_ars_month: 14900, price_usd_month: null } : p,
    );
    const { user } = renderApp('/planes', createMockDb({ plans }));

    await user.click(within(await currency()).getByRole('button', { name: 'Dólares' }));

    expect(within(card('Productor')).getByText('Precio a confirmar')).toBeInTheDocument();
    expect(within(card('Productor')).queryByText('$ 14.900')).toBeNull();
  });

  it('says both currencies are accepted and how often prices change', async () => {
    renderApp('/planes', createMockDb({ plans: pricedPlans }));

    expect(
      await screen.findByText(
        'Podés pagar en pesos o en dólares. Actualizamos los precios cada 3 meses.',
      ),
    ).toBeInTheDocument();
  });
});
