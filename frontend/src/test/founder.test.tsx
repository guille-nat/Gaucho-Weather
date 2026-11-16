import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockDb } from '../mocks/handlers';
import { account, demoUser } from '../mocks/fixtures';
import { renderApp } from './renderApp';

const trialUser = account({
  id: 3,
  email: 'c@x.com',
  name: 'Carla Paz',
  plan_expires_at: new Date(Date.now() + 12 * 86_400_000).toISOString(),
});

/** The page header holds the title, the account's name and, for founders, the badge. */
const perfilHeader = async () =>
  (await screen.findByRole('heading', { level: 1, name: 'Perfil' })).closest('header')!;

describe('Founder badge (cuenta-planes-alertas S13)', () => {
  it('shows the founder number next to the name in the Perfil header', async () => {
    renderApp('/perfil', createMockDb({ user: demoUser }));

    const header = await perfilHeader();
    expect(await within(header).findByText('Ana Ferreyra')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Founder n.º 7' })).toBeInTheDocument();
  });

  it('explains what being a founder means when the badge is tapped, and only what is true', async () => {
    const { user } = renderApp('/perfil', createMockDb({ user: demoUser }));

    const badge = await screen.findByRole('button', { name: 'Founder n.º 7' });
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    await user.click(badge);

    expect(badge).toHaveAttribute('aria-expanded', 'true');
    const story = screen.getByRole('region', { name: 'Sos founder' });
    expect(
      within(story).getByText(
        'Sos founder n.º 7: una de las primeras 100 personas que confiaron en Gaucho Weather.',
      ),
    ).toBeInTheDocument();
    expect(
      within(story).getByText('Tenés el plan Productor gratis para siempre.'),
    ).toBeInTheDocument();
    expect(
      within(story).getByText('El n.º 7 es tuyo para siempre: nadie más lo va a tener.'),
    ).toBeInTheDocument();
    expect(
      within(story).getByText(
        'Gracias por ayudarnos a construir Gaucho Weather desde el principio.',
      ),
    ).toBeInTheDocument();

    await user.click(badge);
    expect(screen.queryByRole('region', { name: 'Sos founder' })).toBeNull();
  });

  it('marks the Perfil tab of a founder without renaming it', async () => {
    renderApp('/perfil', createMockDb({ user: demoUser }));

    const tab = await screen.findByRole('link', { name: 'Perfil' });
    await waitFor(() => expect(tab.querySelector('.tab-founder')).not.toBeNull());
    expect(tab).toHaveAccessibleDescription('Founder n.º 7');
  });

  it('shows nothing to someone who is not a founder', async () => {
    renderApp('/perfil', createMockDb({ user: trialUser }));

    const header = await perfilHeader();
    expect(await within(header).findByText('Carla Paz')).toBeInTheDocument();
    expect(screen.queryByText(/Founder n\.º/)).toBeNull();
    const tab = screen.getByRole('link', { name: 'Perfil' });
    expect(tab.querySelector('.tab-founder')).toBeNull();
    expect(tab).not.toHaveAccessibleDescription();
  });
});
