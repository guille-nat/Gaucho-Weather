import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { demoPublicForecast } from '../mocks/forecast';
import { createMockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';
import { server } from './server';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

const lenses = () => document.querySelectorAll('.tab-lens');

describe('motion hooks (motion-pass)', () => {
  it('keeps one glass lens, under the active tab, and moves it with the page', async () => {
    const { user } = renderApp('/lotes', createMockDb({ user: demoUser, lotes: demoLotes() }));
    const nav = screen.getByRole('navigation', { name: 'Principal' });

    const lotes = within(nav).getByRole('link', { name: 'Lotes' });
    expect(lenses()).toHaveLength(1);
    expect(lotes.querySelector('.tab-lens')).toHaveAttribute('aria-hidden', 'true');

    await user.click(within(nav).getByRole('link', { name: 'Alertas' }));
    await waitFor(() =>
      expect(
        within(nav).getByRole('link', { name: 'Alertas' }).querySelector('.tab-lens'),
      ).not.toBeNull(),
    );
    expect(lenses()).toHaveLength(1);
  });

  it('numbers the 7-day rain bars so they grow one after another', async () => {
    renderApp('/', createMockDb({ user: null }));

    await screen.findByRole('list', { name: 'Próximos 7 días' });
    const bars = [...document.querySelectorAll<HTMLElement>('[data-rain-bar]')];
    expect(bars).toHaveLength(7);
    expect(bars.map((bar) => bar.style.getPropertyValue('--i'))).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
  });

  it('reveals the forecast in steps after a visible wait, not when it comes from the cache', async () => {
    const { user } = renderApp('/', createMockDb({ user: demoUser, lotes: demoLotes() }));
    // After renderApp, which installs the mock API: this answer comes later than a glance.
    server.use(
      http.get('*/api/pronostico/', async () => {
        await delay(200);
        return HttpResponse.json(demoPublicForecast('sol'));
      }),
    );
    await screen.findByRole('region', { name: 'Ahora' });
    expect(document.querySelector('.forecast[data-reveal]')).not.toBeNull();

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    await user.click(within(nav).getByRole('link', { name: 'Lotes' }));
    await screen.findByRole('heading', { level: 1, name: 'Mis lotes' });
    await user.click(within(nav).getByRole('link', { name: 'Clima' }));
    await screen.findByRole('region', { name: 'Ahora' });
    expect(document.querySelector('.forecast[data-reveal]')).toBeNull();
  });
});
