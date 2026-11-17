import { screen, waitFor, within } from '@testing-library/react';
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

  it('lists name, email and password as closed details with what they hold now', async () => {
    renderApp('/perfil', withAccount());
    const datos = await screen.findByRole('region', { name: 'Tus datos' });

    for (const [label, value] of [
      ['Nombre', demoUser.name],
      ['Email', demoUser.email],
      ['Contraseña', 'La que usás para entrar'],
    ]) {
      const summary = rowSummary(datos, label!);
      expect(summary.tagName).toBe('SUMMARY');
      expect(summary).toHaveTextContent(`${label} ${value}`);
      expect(summary.closest('details')).not.toHaveAttribute('open');
    }
    expect(within(datos).queryByLabelText('Contraseña actual')).toBeNull();
  });

  it('opens one form at a time', async () => {
    const { user } = renderApp('/perfil', withAccount());
    const datos = await screen.findByRole('region', { name: 'Tus datos' });
    const email = rowSummary(datos, 'Email');
    const clave = rowSummary(datos, 'Contraseña');

    await user.click(email);
    expect(email.closest('details')).toHaveAttribute('open');
    expect(await within(datos).findByLabelText('Email')).toBeVisible();
    expect(within(datos).getAllByLabelText('Contraseña actual')).toHaveLength(1);

    await user.click(clave);
    expect(email.closest('details')).not.toHaveAttribute('open');
    expect(clave.closest('details')).toHaveAttribute('open');
    expect(await within(datos).findByLabelText('Contraseña nueva')).toBeVisible();
    await waitFor(() => expect(within(datos).queryByLabelText('Email')).toBeNull());

    await user.click(clave);
    await waitFor(() => expect(within(datos).queryByLabelText('Contraseña nueva')).toBeNull());
  });
});

/** The summary of a "Tus datos" row, found by its label (summary has no implicit ARIA role). */
export function rowSummary(datos: HTMLElement, label: string): HTMLElement {
  const text = within(datos).getByText(label, { selector: '.account-row-label' });
  return text.closest('summary')!;
}
