import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const account = { email: demoUser.email, password: 'tranquera-2026', user: demoUser };

describe('auth guard', () => {
  it('sends an anonymous visitor to the login screen', async () => {
    renderApp('/', createMockDb({ user: null }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mis lotes' })).not.toBeInTheDocument();
  });

  it('lets a logged-in user straight into Mis lotes', async () => {
    renderApp('/', createMockDb({ user: demoUser, lotes: demoLotes() }));

    expect(await screen.findByRole('heading', { name: 'Mis lotes' })).toBeInTheDocument();
  });
});

describe('login', () => {
  it('logs in and opens Mis lotes, sending the CSRF header', async () => {
    const db = createMockDb({ accounts: [account], lotes: demoLotes() });
    const issued = db.csrfToken;
    const { user } = renderApp('/', db);

    await user.type(await screen.findByLabelText('Email'), demoUser.email);
    await user.type(screen.getByLabelText('Contraseña'), account.password);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { name: 'Mis lotes' })).toBeInTheDocument();
    expect(db.unsafeRequests).toEqual([{ method: 'POST', path: '/api/auth/login/', csrf: issued }]);
  });

  it('refreshes a stale CSRF token and retries once', async () => {
    document.cookie = 'csrftoken=stale-token; path=/';
    const db = createMockDb({ accounts: [account], lotes: demoLotes() });
    const issued = db.csrfToken;
    const { user } = renderApp('/ingresar', db);

    await user.type(await screen.findByLabelText('Email'), demoUser.email);
    await user.type(screen.getByLabelText('Contraseña'), account.password);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { name: 'Mis lotes' })).toBeInTheDocument();
    expect(db.unsafeRequests.map((r) => r.csrf)).toEqual(['stale-token', issued]);
  });

  it('sends the token Django rotated at login on the next unsafe request', async () => {
    const db = createMockDb({ accounts: [account], lotes: demoLotes() });
    const issued = db.csrfToken;
    const { user } = renderApp('/ingresar', db);

    await user.type(await screen.findByLabelText('Email'), demoUser.email);
    await user.type(screen.getByLabelText('Contraseña'), account.password);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    await user.click(await screen.findByRole('link', { name: 'Perfil' }));
    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    const logoutRequest = db.unsafeRequests.find((r) => r.path === '/api/auth/logout/');
    expect(logoutRequest?.csrf).toBe(db.csrfToken);
    expect(logoutRequest?.csrf).not.toBe(issued);
  });

  it('shows the server message when the credentials are wrong', async () => {
    const db = createMockDb({ accounts: [account] });
    const { user } = renderApp('/ingresar', db);

    await user.type(await screen.findByLabelText('Email'), demoUser.email);
    await user.type(screen.getByLabelText('Contraseña'), 'otra-clave');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
    expect(screen.getByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(db.user).toBeNull();
  });
});

describe('register', () => {
  it('creates the account, logs in and shows the empty Mis lotes', async () => {
    const db = createMockDb();
    const { user } = renderApp('/crear-cuenta', db);

    await user.type(await screen.findByLabelText('Nombre'), 'Juan Pérez');
    await user.type(screen.getByLabelText('Email'), 'juan@campo.com.ar');
    await user.type(screen.getByLabelText('Contraseña'), 'alambrado-99');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Mis lotes' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Agregá tu primer lote' })).toBeInTheDocument();
    expect(db.user).toMatchObject({ email: 'juan@campo.com.ar', name: 'Juan Pérez' });
  });

  it('shows field errors from the server next to the field', async () => {
    const db = createMockDb({ accounts: [account] });
    const { user } = renderApp('/crear-cuenta', db);

    await user.type(await screen.findByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Email'), demoUser.email);
    await user.type(screen.getByLabelText('Contraseña'), 'alambrado-99');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Ya existe una cuenta con este email.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('logout', () => {
  it('logs out from Perfil and returns to the login screen', async () => {
    const db = createMockDb({ user: demoUser, lotes: demoLotes() });
    const { user } = renderApp('/perfil', db);

    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(db.user).toBeNull();
  });
});
