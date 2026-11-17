import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { demoLotes, demoUser, planOf } from '../mocks/fixtures';
import { renderApp } from './renderApp';
import { server } from './server';

const withAccount = (overrides = {}) => {
  const user = { ...demoUser, ...overrides };
  return createMockDb({
    user,
    accounts: [{ email: user.email, password: 'pampa-humeda-2026', user }],
    lotes: demoLotes().slice(0, 1),
  });
};

const NOTHING_OUTSIDE =
  'Así no te llega ningún aviso al teléfono ni al email: las alertas quedan solo en Alertas.';

async function avisos() {
  return screen.findByRole('region', { name: 'Cómo te avisamos' });
}

describe('Perfil: reliable alerts (perfil-ux S2)', () => {
  it('says the Alertas inbox always gets the alerts', async () => {
    renderApp('/perfil', withAccount());

    expect(
      within(await avisos()).getByText('Las alertas siempre quedan en Alertas, en la app.'),
    ).toBeInTheDocument();
  });

  it('warns when push and email are both off, and stops warning when one comes back', async () => {
    const { user } = renderApp('/perfil', withAccount());
    const section = await avisos();

    await user.click(within(section).getByRole('switch', { name: 'Notificaciones push' }));
    expect(within(section).queryByText(NOTHING_OUTSIDE)).not.toBeInTheDocument();

    await user.click(within(section).getByRole('switch', { name: 'Alertas por email' }));
    expect(await within(section).findByText(NOTHING_OUTSIDE)).toBeInTheDocument();

    await user.click(within(section).getByRole('switch', { name: 'Alertas por email' }));
    expect(within(section).queryByText(NOTHING_OUTSIDE)).not.toBeInTheDocument();
  });

  it('warns on a plan without push as soon as email goes off', async () => {
    const { user } = renderApp(
      '/perfil',
      withAccount({ plan: planOf('basico'), founder_number: null }),
    );
    const section = await avisos();

    await user.click(within(section).getByRole('switch', { name: 'Alertas por email' }));

    expect(await within(section).findByText(NOTHING_OUTSIDE)).toBeInTheDocument();
  });

  it('moves the switch at once and says it is saving until the server answers', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => (answer = resolve));
    server.use(
      http.patch('*/api/auth/me/', async ({ request }) => {
        const body = (await request.json()) as { notify_email: boolean };
        await answered;
        db.user = { ...db.user!, ...body };
        return HttpResponse.json(db.user);
      }),
    );
    const section = await avisos();
    const toggle = within(section).getByRole('switch', { name: 'Alertas por email' });

    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
    expect(within(section).getByText('Guardando…')).toBeInTheDocument();
    answer();
    expect(await within(section).findByText('Preferencias guardadas.')).toBeInTheDocument();
    expect(db.user?.notify_email).toBe(false);
  });

  it('puts the switch back and says why when the change cannot be saved', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);
    server.use(http.patch('*/api/auth/me/', () => HttpResponse.error()));
    const section = await avisos();
    const toggle = within(section).getByRole('switch', { name: 'Alertas por email' });

    await user.click(toggle);

    expect(
      await within(section).findByText('Sin conexión. Probá de nuevo cuando tengas señal.'),
    ).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(within(section).queryByText('Preferencias guardadas.')).not.toBeInTheDocument();
    expect(db.user?.notify_email).toBe(true);
  });

  it('keeps both switches off when the first answer arrives after the second', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.patch('*/api/auth/me/', async ({ request }) => {
        const body = (await request.json()) as Record<string, boolean>;
        db.user = { ...db.user!, ...body };
        // The push answer was built before the email change reached the server.
        const answer = { ...db.user };
        if ('notify_push' in body) await gate;
        return HttpResponse.json(answer);
      }),
    );
    const section = await avisos();
    const push = within(section).getByRole('switch', { name: 'Notificaciones push' });
    const email = within(section).getByRole('switch', { name: 'Alertas por email' });

    await user.click(push);
    await user.click(email);
    await within(section).findByText('Preferencias guardadas.');
    release();
    await within(section).findByText(NOTHING_OUTSIDE);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(push).not.toBeChecked();
    expect(email).not.toBeChecked();
    expect(db.user).toMatchObject({ notify_push: false, notify_email: false });
  });

  it('ties the disabled push switch to the reason it is disabled', async () => {
    renderApp('/perfil', withAccount({ plan: planOf('basico'), founder_number: null }));

    const push = within(await avisos()).getByRole('switch', { name: 'Notificaciones push' });
    expect(push).toHaveAccessibleDescription(
      'Tu plan Básico no incluye notificaciones push. Ver planes',
    );
  });
});
