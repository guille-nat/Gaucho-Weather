import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const withAccount = () =>
  createMockDb({
    user: demoUser,
    accounts: [{ email: demoUser.email, password: 'pampa-humeda-2026', user: demoUser }],
    lotes: demoLotes().slice(0, 1),
  });

describe('Perfil layout (perfil-ux S3)', () => {
  it('puts the alerts first, then the plan and the data, and deleting last', async () => {
    renderApp('/perfil', withAccount());
    await screen.findByRole('region', { name: 'Cómo te avisamos' });

    const titles = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-labelledby'));
    const names = titles.map((id) => document.getElementById(id!)?.textContent);
    expect(names).toEqual(['Cómo te avisamos', 'Tu plan', 'Tus datos', 'Borrar cuenta']);
  });

  it('lists name, email and password as rows with what they hold now', async () => {
    renderApp('/perfil', withAccount());
    const datos = await screen.findByRole('region', { name: 'Tus datos' });

    expect(within(datos).getByRole('button', { name: `Nombre ${demoUser.name}` })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      within(datos).getByRole('button', { name: `Email ${demoUser.email}` }),
    ).toBeInTheDocument();
    expect(
      within(datos).getByRole('button', { name: 'Contraseña La que usás para entrar' }),
    ).toBeInTheDocument();
    expect(within(datos).queryByLabelText('Contraseña actual')).not.toBeInTheDocument();
  });

  it('opens one form at a time', async () => {
    const { user } = renderApp('/perfil', withAccount());
    const datos = await screen.findByRole('region', { name: 'Tus datos' });
    const emailRow = within(datos).getByRole('button', { name: /^Email/ });
    const claveRow = within(datos).getByRole('button', { name: /^Contraseña/ });

    await user.click(emailRow);
    expect(emailRow).toHaveAttribute('aria-expanded', 'true');
    expect(within(datos).getByLabelText('Email')).toBeInTheDocument();
    expect(within(datos).getAllByLabelText('Contraseña actual')).toHaveLength(1);

    await user.click(claveRow);
    expect(emailRow).toHaveAttribute('aria-expanded', 'false');
    expect(claveRow).toHaveAttribute('aria-expanded', 'true');
    expect(within(datos).queryByLabelText('Email')).not.toBeInTheDocument();
    expect(within(datos).getByLabelText('Contraseña nueva')).toBeInTheDocument();

    await user.click(claveRow);
    expect(within(datos).queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
  });
});
