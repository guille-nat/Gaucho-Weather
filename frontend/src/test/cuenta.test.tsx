import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser, planOf } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const PASSWORD = 'pampa-humeda-2026';
const withAccount = (overrides = {}) => {
  const user = { ...demoUser, ...overrides };
  return createMockDb({
    user,
    accounts: [{ email: user.email, password: PASSWORD, user }],
    lotes: demoLotes().slice(0, 1),
  });
};

describe('Cuenta en Perfil (S5)', () => {
  it('shows the plan, the founder number and the lotes used', async () => {
    renderApp('/perfil', withAccount());

    const plan = await screen.findByRole('region', { name: 'Tu plan' });
    expect(within(plan).getByText('Productor')).toBeInTheDocument();
    expect(within(plan).getByText('Founder n.º 7 · gratis para siempre')).toBeInTheDocument();
    expect(within(plan).getByText('1 de 15 lotes')).toBeInTheDocument();
    expect(within(plan).getByRole('link', { name: 'Comparar planes' })).toHaveAttribute(
      'href',
      '/planes',
    );
  });

  it('renames the account', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);

    const datos = await screen.findByRole('region', { name: 'Tus datos' });
    await user.click(within(datos).getByText('Nombre', { selector: '.account-row-label' }));
    const name = within(datos).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Ana María Ferreyra');
    await user.click(within(datos).getByRole('button', { name: 'Guardar nombre' }));

    expect(await within(datos).findByText('Nombre guardado.')).toBeInTheDocument();
    expect(db.user?.name).toBe('Ana María Ferreyra');
  });

  it('changes the email only with the current password', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);

    const datos = await screen.findByRole('region', { name: 'Tus datos' });
    await user.click(within(datos).getByText('Email', { selector: '.account-row-label' }));
    const email = within(datos).getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'ana@nuevo.com.ar');
    await user.type(within(datos).getByLabelText('Contraseña actual'), 'equivocada');
    await user.click(within(datos).getByRole('button', { name: 'Cambiar email' }));

    expect(await within(datos).findByText('La contraseña no es correcta.')).toBeInTheDocument();
    expect(db.user?.email).toBe(demoUser.email);

    await user.clear(within(datos).getByLabelText('Contraseña actual'));
    await user.type(within(datos).getByLabelText('Contraseña actual'), PASSWORD);
    await user.click(within(datos).getByRole('button', { name: 'Cambiar email' }));

    expect(await within(datos).findByText('Email cambiado.')).toBeInTheDocument();
    expect(db.user?.email).toBe('ana@nuevo.com.ar');
  });

  it('turns email alerts off', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);

    const avisos = await screen.findByRole('region', { name: 'Cómo te avisamos' });
    const toggle = within(avisos).getByRole('switch', { name: 'Alertas por email' });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    await screen.findByText('Preferencias guardadas.');
    expect(db.user?.notify_email).toBe(false);
    expect(toggle).not.toBeChecked();
  });

  it('says push needs a plan that includes it', async () => {
    renderApp('/perfil', withAccount({ plan: planOf('basico'), founder_number: null }));

    const avisos = await screen.findByRole('region', { name: 'Cómo te avisamos' });
    expect(within(avisos).getByRole('switch', { name: 'Notificaciones push' })).toBeDisabled();
    expect(
      within(avisos).getByText('Tu plan Básico no incluye notificaciones push.'),
    ).toBeInTheDocument();
  });

  it('changes the password', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);

    const clave = await screen.findByRole('region', { name: 'Tus datos' });
    await user.click(within(clave).getByText('Contraseña', { selector: '.account-row-label' }));
    await user.type(within(clave).getByLabelText('Contraseña actual'), PASSWORD);
    await user.type(within(clave).getByLabelText('Contraseña nueva'), 'trigo-y-soja-2027');
    await user.click(within(clave).getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await within(clave).findByText('Contraseña cambiada.')).toBeInTheDocument();
    expect(db.accounts[0]?.password).toBe('trigo-y-soja-2027');
  });

  it('deletes the account after the password and says so on the login screen', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);

    const borrar = await screen.findByRole('region', { name: 'Borrar cuenta' });
    await user.click(within(borrar).getByText('Quiero borrar mi cuenta'));
    await user.type(within(borrar).getByLabelText('Tu contraseña'), 'equivocada');
    await user.click(within(borrar).getByRole('button', { name: 'Borrar mi cuenta' }));
    expect(await within(borrar).findByText('La contraseña no es correcta.')).toBeInTheDocument();

    await user.clear(within(borrar).getByLabelText('Tu contraseña'));
    await user.type(within(borrar).getByLabelText('Tu contraseña'), PASSWORD);
    await user.click(within(borrar).getByRole('button', { name: 'Borrar mi cuenta' }));

    expect(
      await screen.findByText('Borramos tu cuenta, sus lotes y sus alertas.'),
    ).toBeInTheDocument();
    expect(db.accounts).toHaveLength(0);
    expect(db.lotes).toHaveLength(0);
  });
});

describe('Recuperar la contraseña (S5)', () => {
  it('is reachable from the login screen', async () => {
    renderApp('/ingresar', createMockDb());

    expect(await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/recuperar',
    );
  });

  it('asks for the email and answers the same whether or not it has an account', async () => {
    const db = createMockDb();
    const { user } = renderApp('/recuperar', db);

    await user.type(await screen.findByLabelText('Email'), 'alguien@campo.com.ar');
    await user.click(screen.getByRole('button', { name: 'Mandar enlace' }));

    expect(
      await screen.findByText(
        'Si hay una cuenta con alguien@campo.com.ar, te mandamos un enlace para elegir una contraseña nueva. Vence en 1 hora.',
      ),
    ).toBeInTheDocument();
    expect(db.resetRequests).toEqual(['alguien@campo.com.ar']);
  });

  it('sets a new password from the link and sends you to log in', async () => {
    const db = withAccount();
    db.user = null;
    db.resetLinks = { 'MQ/tok-1': demoUser.email };
    const { user } = renderApp('/restablecer/MQ/tok-1', db);

    await user.type(await screen.findByLabelText('Contraseña nueva'), 'lluvia-de-noviembre');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(
      await screen.findByText('Listo: ya podés entrar con tu contraseña nueva.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(db.accounts[0]?.password).toBe('lluvia-de-noviembre');
  });

  it('offers a new link when this one expired', async () => {
    const db = createMockDb();
    const { user } = renderApp('/restablecer/MQ/vencido', db);

    await user.type(await screen.findByLabelText('Contraseña nueva'), 'lluvia-de-noviembre');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El enlace no es válido o venció. Pedí uno nuevo.');
    expect(within(alert).getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute(
      'href',
      '/recuperar',
    );
  });
});
