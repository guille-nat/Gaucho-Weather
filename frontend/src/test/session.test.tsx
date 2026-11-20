import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Lote, User } from '../api/types';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { readPersisted, seedPersisted, stubCaches } from './localData';
import { renderApp } from './renderApp';
import { server } from './server';

const PENDING_LOGOUT = 'gw-pending-logout';

const otherUser: User = { id: 2, email: 'beto@eltala.com.ar', name: 'Beto Gómez' };
const otherLote: Lote = { ...demoLotes()[2]!, id: 31, name: 'Potrero 9', establishment: 'El Tala' };

/** Every lote name of the first user, as it would leak on screen or in storage. */
const firstUserNames = ['El Ombú', 'La Esperanza', 'San Cayetano'];

describe('session end clears this phone', () => {
  it('drops the previous user data when /me says the session ended', async () => {
    const cachesDelete = stubCaches();
    await seedPersisted({ user: demoUser, lotes: demoLotes() });

    renderApp('/lotes', createMockDb({ user: null }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    await waitFor(async () => expect((await readPersisted()).roots).not.toContain('lotes'));
    await waitFor(() => expect(cachesDelete).toHaveBeenCalledWith('api-lotes'));
  });

  it('starts a new login without the data of whoever used the phone before', async () => {
    const cachesDelete = stubCaches();
    await seedPersisted({ user: demoUser, lotes: demoLotes() });
    const db = createMockDb({
      accounts: [{ email: otherUser.email, password: 'molino-2026', user: otherUser }],
      lotes: [otherLote],
    });
    const { user } = renderApp('/ingresar', db);

    // The restored session briefly opens Mis lotes before /me says it ended: type only after the
    // phone was cleared, or the form remounts under the typing (a race of the test, not the app).
    await waitFor(async () => expect((await readPersisted()).roots).not.toContain('lotes'));
    await user.type(await screen.findByLabelText('Email'), otherUser.email);
    await user.type(screen.getByLabelText('Contraseña'), 'molino-2026');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    const list = await screen.findByRole('list', { name: 'Lotes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Potrero 9 · El Tala')).toBeInTheDocument();
    for (const name of firstUserNames) {
      expect(screen.queryByText(new RegExp(name))).not.toBeInTheDocument();
    }
    await waitFor(async () => {
      const { text } = await readPersisted();
      expect(text).toContain('Potrero 9');
      for (const name of firstUserNames) expect(text).not.toContain(name);
    });
    expect(cachesDelete).toHaveBeenCalledWith('api-lotes');
  });

  it('clears IndexedDB and the service worker cache on logout', async () => {
    const cachesDelete = stubCaches();
    await seedPersisted({ user: demoUser, lotes: demoLotes() });
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/perfil', db);

    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(db.user).toBeNull();
    await waitFor(async () => expect((await readPersisted()).roots).not.toContain('lotes'));
    expect(cachesDelete).toHaveBeenCalledWith('api-lotes');
  });

  it('drops the cached lote forecasts on logout but keeps the public forecast', async () => {
    const cachesDelete = stubCaches();
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/lotes/4', db);

    await screen.findByRole('region', { name: 'Hoy en este lote' });
    await waitFor(async () =>
      expect((await readPersisted()).text).toContain('Noche despejada y calma'),
    );
    await user.click(screen.getByRole('link', { name: 'Perfil' }));
    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    await waitFor(async () =>
      expect((await readPersisted()).text).not.toContain('Noche despejada y calma'),
    );
    expect(cachesDelete).toHaveBeenCalledWith('api-lotes');
    expect(cachesDelete).not.toHaveBeenCalledWith('api-publico');
  });

  it('signs out locally when logout fails with no signal, and says so', async () => {
    const cachesDelete = stubCaches();
    await seedPersisted({ user: demoUser, lotes: demoLotes() });
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/perfil', db);
    server.use(http.post('*/api/auth/logout/', () => HttpResponse.error()));

    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    // The guard may show Ingresar a moment before Perfil's own redirect brings the message.
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saliste en este teléfono y borramos sus datos guardados. Como no había señal, ' +
        'cerramos la sesión en el servidor la próxima vez que abras la app con conexión.',
    );
    await waitFor(async () => expect((await readPersisted()).roots).not.toContain('lotes'));
    expect(cachesDelete).toHaveBeenCalledWith('api-lotes');
    expect(localStorage.getItem(PENDING_LOGOUT)).toBe('1');
  });

  it('finishes a pending logout on the server at the next start with signal', async () => {
    localStorage.setItem(PENDING_LOGOUT, '1');
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });

    renderApp('/lotes', db);

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(db.user).toBeNull();
    expect(db.unsafeRequests.map((r) => r.path)).toEqual(['/api/auth/logout/']);
    expect(localStorage.getItem(PENDING_LOGOUT)).toBeNull();
  });
});
