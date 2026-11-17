import { onlineManager } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { seedPersisted } from './localData';
import { renderApp } from './renderApp';
import { server } from './server';

describe('Mis lotes', () => {
  it('lists every lote with its meta line, outline, headline and tonight minimum', async () => {
    renderApp('/lotes', createMockDb({ user: demoUser, lotes: demoLotes() }));

    const list = await screen.findByRole('list', { name: 'Lotes' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);

    const lote4 = items[1]!;
    expect(within(lote4).getByText('Lote 4 · La Esperanza')).toBeInTheDocument();
    expect(within(lote4).getByText('Firmat · Soja · Maíz · 120 ha')).toBeInTheDocument();
    expect(within(lote4).getByRole('img', { name: /Plano del lote 4/ })).toBeInTheDocument();
    expect(lote4.querySelector('.lote-card-say')).toHaveTextContent(
      /^Mín\. esta noche \(2 m\) 3 °C$/,
    );
    // The most urgent decision of the lote, with its level in words, not only in colour.
    expect(
      within(lote4).getByText('Ojo con la helada: en el suelo puede bajar a −0,6 °C.'),
    ).toBeInTheDocument();
    expect(within(lote4).getByText('Ojo')).toBeInTheDocument();
    expect(within(lote4).getByRole('link')).toHaveAttribute('href', '/lotes/4');

    const lote7 = items[2]!;
    expect(
      within(lote7).getByText('Estamos juntando el primer pronóstico de este lote'),
    ).toBeInTheDocument();
    expect(
      within(lote7).getByRole('img', { name: 'Plano del lote 7, sin datos aún' }),
    ).toBeVisible();
  });

  it('labels the top bar with the time of the forecast, not of the fetch', async () => {
    renderApp('/lotes', createMockDb({ user: demoUser, lotes: demoLotes() }));

    await screen.findByRole('list', { name: 'Lotes' });
    // fetched_at 09:10 UTC is 06:10 in Argentina.
    expect(screen.getByText('Pronóstico de las 06:10')).toBeInTheDocument();
    expect(screen.queryByText(/Actualizado/)).not.toBeInTheDocument();
  });

  it('invites a new user to add the first lote', async () => {
    renderApp('/lotes', createMockDb({ user: demoUser, lotes: [] }));

    const cta = await screen.findByRole('link', { name: 'Agregá tu primer lote' });
    expect(cta).toHaveAttribute('href', '/lotes/nuevo');
    expect(screen.queryByRole('list', { name: 'Lotes' })).not.toBeInTheDocument();
  });

  it('shows the last persisted lotes offline, saying how old they are', async () => {
    // 09:10 UTC is 06:10 in Argentina (UTC-3, no DST).
    const savedAt = Date.UTC(2026, 10, 3, 9, 10);
    await seedPersisted({ user: demoUser, lotes: demoLotes(), savedAt });
    onlineManager.setOnline(false);

    // Had the app reached the network, this empty account would have replaced the list.
    const db = createMockDb({ user: demoUser, lotes: [] });
    renderApp('/lotes', db);

    expect(await screen.findByText('Sin conexión · datos de las 06:10')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Lotes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Lote 12 · El Ombú')).toBeInTheDocument();
  });

  it('shows a list answered by the service worker cache as offline data, with the server time', async () => {
    // 15:00 UTC is 12:00 in Argentina: that "now" must not appear anywhere.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 3, 15, 0));
    // The server produced this answer last night, 23:45 UTC = 20:45 in Argentina.
    const servedAt = new Date(Date.UTC(2026, 10, 2, 23, 45)).toUTCString();

    renderApp('/lotes', createMockDb({ user: demoUser, lotes: demoLotes() }));
    server.use(
      http.get('*/api/lotes/', () =>
        HttpResponse.json(demoLotes(), { headers: { 'X-From-SW-Cache': '1', Date: servedAt } }),
      ),
    );

    expect(await screen.findByText('Sin conexión · datos de las 20:45')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Lotes' })).toBeInTheDocument();
    expect(screen.queryByText(/12:00/)).not.toBeInTheDocument();
  });
});
