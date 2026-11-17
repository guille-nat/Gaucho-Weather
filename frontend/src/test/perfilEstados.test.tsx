import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser } from '../mocks/fixtures';
import type { PlanChange } from '../api/types';
import { renderApp } from './renderApp';
import { server } from './server';

const PASSWORD = 'pampa-humeda-2026';
const withAccount = (extra = {}) =>
  createMockDb({
    user: demoUser,
    accounts: [{ email: demoUser.email, password: PASSWORD, user: demoUser }],
    lotes: demoLotes().slice(0, 1),
    ...extra,
  });

async function openRow(name: RegExp) {
  const datos = await screen.findByRole('region', { name: 'Tus datos' });
  return { datos, row: within(datos).getByRole('button', { name }) };
}

describe('Perfil states (perfil-ux S4)', () => {
  it('keeps each save button off until something changed', async () => {
    const { user } = renderApp('/perfil', withAccount());

    const { datos, row: nameRow } = await openRow(/^Nombre/);
    await user.click(nameRow);
    const saveName = within(datos).getByRole('button', { name: 'Guardar nombre' });
    expect(saveName).toBeDisabled();
    await user.type(within(datos).getByLabelText('Nombre'), ' María');
    expect(saveName).toBeEnabled();

    await user.click(within(datos).getByRole('button', { name: /^Email/ }));
    const saveEmail = within(datos).getByRole('button', { name: 'Cambiar email' });
    expect(saveEmail).toBeDisabled();
    await user.type(within(datos).getByLabelText('Email'), 'x');
    expect(saveEmail).toBeDisabled();
    await user.type(within(datos).getByLabelText('Contraseña actual'), PASSWORD);
    expect(saveEmail).toBeEnabled();

    await user.click(within(datos).getByRole('button', { name: /^Contraseña/ }));
    const savePassword = within(datos).getByRole('button', { name: 'Cambiar contraseña' });
    expect(savePassword).toBeDisabled();
    await user.type(within(datos).getByLabelText('Contraseña actual'), PASSWORD);
    expect(savePassword).toBeDisabled();
    await user.type(within(datos).getByLabelText('Contraseña nueva'), 'trigo-y-soja-2027');
    expect(savePassword).toBeEnabled();
  });

  it('stops saying the name was saved once it is edited again', async () => {
    const { user } = renderApp('/perfil', withAccount());
    const { datos, row } = await openRow(/^Nombre/);
    await user.click(row);
    const name = within(datos).getByLabelText('Nombre');

    await user.type(name, ' María');
    await user.click(within(datos).getByRole('button', { name: 'Guardar nombre' }));
    expect(await within(datos).findByText('Nombre guardado.')).toBeInTheDocument();

    await user.type(name, 'na');
    expect(within(datos).queryByText('Nombre guardado.')).not.toBeInTheDocument();
  });
});

describe('Suscripción states (perfil-ux S4)', () => {
  it('shows the shape of the page while it loads', async () => {
    server.use(
      http.get('*/api/auth/suscripcion/', async () => {
        await new Promise(() => {});
        return HttpResponse.json({});
      }),
    );
    renderApp('/perfil/suscripcion', withAccount());

    expect(await screen.findByText('Cargando tu suscripción…')).toHaveAttribute('role', 'status');
    expect(document.querySelector('.account-skeleton[aria-busy="true"]')).not.toBeNull();
  });

  it('says what failed and offers to try again', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil/suscripcion', db);
    server.use(
      http.get(
        '*/api/auth/suscripcion/',
        () =>
          HttpResponse.json(
            { detail: 'No pudimos cargar tu suscripción. Probá en unos minutos.' },
            { status: 503 },
          ),
        { once: true },
      ),
    );

    expect(
      await screen.findByText('No pudimos cargar tu suscripción. Probá en unos minutos.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('region', { name: 'Tu plan' })).toBeInTheDocument();
  });

  it('lists two identical history entries without a key clash', async () => {
    const same: PlanChange = {
      at: '2026-11-01T12:00:00Z',
      from_plan: { code: 'basico', name: 'Básico' },
      to_plan: { code: 'productor', name: 'Productor' },
      reason: 'staff',
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderApp('/perfil/suscripcion', withAccount({ planHistory: [same, same] }));

    const history = await screen.findByRole('list', { name: 'Cambios de plan' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    errors.mockRestore();
  });
});
