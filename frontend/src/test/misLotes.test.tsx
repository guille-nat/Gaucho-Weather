import { onlineManager, QueryClient } from '@tanstack/react-query';
import { persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { queryKeys } from '../query/keys';
import { createIdbPersister, PERSIST_BUSTER } from '../query/persister';
import { renderApp } from './renderApp';

describe('Mis lotes', () => {
  it('lists every lote with its meta line, outline and tonight minimum', async () => {
    renderApp('/', createMockDb({ user: demoUser, lotes: demoLotes() }));

    const list = await screen.findByRole('list', { name: 'Lotes' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);

    const lote4 = items[1]!;
    expect(within(lote4).getByText('Lote 4 · La Esperanza')).toBeInTheDocument();
    expect(within(lote4).getByText('Firmat · Soja · 120 ha')).toBeInTheDocument();
    expect(within(lote4).getByRole('img', { name: /Plano del lote 4/ })).toBeInTheDocument();
    expect(lote4.querySelector('.lote-card-say')).toHaveTextContent(
      /^Mínima esta noche a 2 m: 3 °C$/,
    );
    expect(within(lote4).getByRole('link')).toHaveAttribute('href', '/lotes/4');

    const lote7 = items[2]!;
    expect(
      within(lote7).getByText('Estamos juntando el primer pronóstico de este lote'),
    ).toBeInTheDocument();
  });

  it('never shows a frost verdict in Phase 1', async () => {
    renderApp('/', createMockDb({ user: demoUser, lotes: demoLotes() }));

    await screen.findByRole('list', { name: 'Lotes' });
    expect(screen.queryByText(/hiela|crítico|riesgo alto/i)).not.toBeInTheDocument();
  });

  it('invites a new user to add the first lote', async () => {
    renderApp('/', createMockDb({ user: demoUser, lotes: [] }));

    const cta = await screen.findByRole('link', { name: 'Agregá tu primer lote' });
    expect(cta).toHaveAttribute('href', '/lotes/nuevo');
    expect(screen.queryByRole('list', { name: 'Lotes' })).not.toBeInTheDocument();
  });

  it('shows the last persisted lotes offline, saying how old they are', async () => {
    // 09:10 UTC is 06:10 in Argentina (UTC-3, no DST).
    const savedAt = Date.UTC(2026, 10, 3, 9, 10);
    const seed = new QueryClient();
    seed.setQueryData(queryKeys.me, demoUser, { updatedAt: savedAt });
    seed.setQueryData(queryKeys.lotes, demoLotes(), { updatedAt: savedAt });
    await persistQueryClientSave({
      queryClient: seed,
      persister: createIdbPersister(),
      buster: PERSIST_BUSTER,
    });
    onlineManager.setOnline(false);

    // Had the app reached the network, this empty account would have replaced the list.
    const db = createMockDb({ user: demoUser, lotes: [] });
    renderApp('/', db);

    expect(await screen.findByText('Sin conexión · datos de las 06:10')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Lotes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Lote 12 · El Ombú')).toBeInTheDocument();
  });
});
