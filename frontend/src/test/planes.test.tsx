import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { account, demoPlans, demoUser, planOf } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const card = (name: string) => screen.getByRole('article', { name: `Plan ${name}` });

describe('Planes (S1, S8)', () => {
  it('shows the three plans with Productor in the middle, recommended', async () => {
    renderApp('/planes', createMockDb());

    expect(await screen.findByRole('heading', { name: 'Planes' })).toBeInTheDocument();
    const names = (await screen.findAllByRole('article')).map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(names).toEqual(['Plan Básico', 'Plan Productor', 'Plan Empresa']);
    expect(within(card('Productor')).getByText('Recomendado')).toBeInTheDocument();
    expect(within(card('Básico')).queryByText('Recomendado')).toBeNull();
    expect(within(card('Empresa')).queryByText('Recomendado')).toBeNull();
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
