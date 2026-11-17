import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertRule, User } from '../api/types';
import * as push from '../lib/push';
import { account, demoAlertEvents, demoLotes, demoUser, planOf } from '../mocks/fixtures';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';
import { server } from './server';

vi.mock('../lib/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/push')>()),
  pushSupported: vi.fn(),
  permission: vi.fn(),
  requestPermission: vi.fn(),
  currentEndpoint: vi.fn(),
  subscribeBrowser: vi.fn(),
  unsubscribeBrowser: vi.fn(),
}));

const browser = vi.mocked(push);
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const SUBSCRIPTION = { endpoint: ENDPOINT, keys: { p256dh: 'BPk3y', auth: 'au7h' } };

/** What this browser holds; the mocked lib/push reads and writes it. */
let subscribedHere: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  subscribedHere = null;
  browser.pushSupported.mockReturnValue(true);
  browser.permission.mockReturnValue('default');
  browser.requestPermission.mockResolvedValue('granted');
  browser.currentEndpoint.mockImplementation(async () => subscribedHere);
  browser.subscribeBrowser.mockImplementation(async () => {
    subscribedHere = ENDPOINT;
    return SUBSCRIPTION;
  });
  browser.unsubscribeBrowser.mockImplementation(async () => {
    subscribedHere = null;
  });
});

function rule(fields: Partial<AlertRule> & Pick<AlertRule, 'id'>): AlertRule {
  return {
    lote: 4,
    lote_name: 'Lote 4',
    variable: 'temp_min',
    comparator: 'lt',
    threshold: 2,
    enabled: true,
    paused_by_plan: false,
    description: 'Mínima menor a 2 °C en Lote 4',
    created_at: '2026-11-10T12:00:00Z',
    ...fields,
  };
}

const basico = (fields: Partial<User> = {}) =>
  account({ id: 9, email: 'beto@eltala.com.ar', name: 'Beto', plan: planOf('basico'), ...fields });

const withAccount = (partial: Partial<MockDb> = {}) =>
  createMockDb({ user: demoUser, lotes: demoLotes(), ...partial });

describe('Avisos: the inbox (S7)', () => {
  it('lists the newest alerts, marks the unread ones and marks them all read', async () => {
    const db = withAccount({ alertEvents: demoAlertEvents() });
    const { user } = renderApp('/alertas', db);

    const inbox = await screen.findByRole('region', { name: 'Avisos' });
    const items = await within(inbox).findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Mínima de 1,5 °C mañana en Lote 4');
    expect(items[0]).toHaveTextContent('Se esperan 1,5 °C mañana a las 06:00.');
    expect(within(inbox).getAllByText('Nuevo')).toHaveLength(2);
    expect(within(inbox).getByText('2 sin leer')).toBeInTheDocument();

    await user.click(within(inbox).getByRole('button', { name: 'Marcar todo como leído' }));

    await waitFor(() => expect(within(inbox).queryByText('Nuevo')).not.toBeInTheDocument());
    expect(db.alertEvents.every((e) => e.read_at !== null)).toBe(true);
    expect(
      within(inbox).queryByRole('button', { name: 'Marcar todo como leído' }),
    ).not.toBeInTheDocument();
  });

  it('marks one alert read when it is tapped', async () => {
    const db = withAccount({ alertEvents: demoAlertEvents() });
    const { user } = renderApp('/alertas', db);

    const inbox = await screen.findByRole('region', { name: 'Avisos' });
    await user.click(
      await within(inbox).findByRole('button', { name: /Ventana para pulverizar hoy en Lote 12/ }),
    );

    await waitFor(() => expect(within(inbox).getAllByText('Nuevo')).toHaveLength(1));
    expect(db.alertEvents.find((e) => e.id === 2)?.read_at).not.toBeNull();
    expect(db.alertEvents.find((e) => e.id === 3)?.read_at).toBeNull();
  });

  it('explains what will show up when there is nothing yet', async () => {
    renderApp('/alertas', withAccount());

    const inbox = await screen.findByRole('region', { name: 'Avisos' });
    expect(
      await within(inbox).findByText(
        'Todavía no hay avisos. Cuando se cumpla una de tus reglas, el aviso aparece acá.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Nueva regla (S6)', () => {
  it('creates a rule with a live preview and counts it', async () => {
    const db = withAccount();
    const { user } = renderApp('/alertas', db);

    const form = await screen.findByRole('region', { name: 'Nueva regla' });
    await user.selectOptions(await within(form).findByLabelText('Lote'), 'Lote 4');
    await user.selectOptions(within(form).getByLabelText('Qué mirar'), 'Temperatura mínima');
    await user.selectOptions(within(form).getByLabelText('Cuando sea'), 'menor a');
    const value = within(form).getByLabelText('Valor (°C)');
    await user.clear(value);
    await user.type(value, '2,5');

    expect(within(form).getByText('Mínima menor a 2,5 °C en Lote 4')).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Crear regla' }));

    expect(await within(form).findByText('Regla creada.')).toBeInTheDocument();
    expect(db.alertRules).toHaveLength(1);
    expect(db.alertRules[0]).toMatchObject({
      lote: 4,
      variable: 'temp_min',
      comparator: 'lt',
      threshold: 2.5,
    });
    const rules = screen.getByRole('region', { name: 'Tus reglas' });
    expect(within(rules).getByText('Mínima menor a 2,5 °C en Lote 4')).toBeInTheDocument();
    expect(await within(rules).findByText('1 regla')).toBeInTheDocument();
  });

  it('offers only the comparisons the server accepts for each variable', async () => {
    const { user } = renderApp('/alertas', withAccount());

    const form = await screen.findByRole('region', { name: 'Nueva regla' });
    const variable = await within(form).findByLabelText('Qué mirar');
    const options = () =>
      within(within(form).getByLabelText('Cuando sea'))
        .getAllByRole('option')
        .map((o) => o.textContent);

    await user.selectOptions(variable, 'Helada en el suelo');
    expect(options()).toEqual(['menor a', 'menor o igual a']);
    await user.selectOptions(variable, 'Lluvia del día');
    expect(options()).toEqual(['mayor a', 'mayor o igual a']);
    expect(within(form).getByLabelText('Valor (mm)')).toBeInTheDocument();
    await user.selectOptions(variable, 'Viento');
    expect(options()).toEqual(['mayor a', 'mayor o igual a']);
    expect(within(form).getByLabelText('Valor (km/h)')).toBeInTheDocument();
    await user.selectOptions(variable, 'Temperatura máxima');
    expect(options()).toEqual(['menor a', 'menor o igual a', 'mayor a', 'mayor o igual a']);
  });

  it('sends the spray window with no comparison and no value', async () => {
    const db = withAccount();
    const { user } = renderApp('/alertas', db);

    const form = await screen.findByRole('region', { name: 'Nueva regla' });
    await user.selectOptions(await within(form).findByLabelText('Lote'), 'Lote 12');
    await user.selectOptions(within(form).getByLabelText('Qué mirar'), 'Ventana para pulverizar');

    expect(within(form).queryByLabelText('Cuando sea')).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/^Valor/)).not.toBeInTheDocument();
    expect(within(form).getByText('Ventana para pulverizar en Lote 12')).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Crear regla' }));

    await within(form).findByText('Regla creada.');
    expect(db.alertRules[0]).toMatchObject({
      lote: 12,
      variable: 'spray_window',
      comparator: null,
      threshold: null,
    });
  });

  it('shows the server error on the field', async () => {
    const db = withAccount();
    const { user } = renderApp('/alertas', db);

    const form = await screen.findByRole('region', { name: 'Nueva regla' });
    await user.selectOptions(await within(form).findByLabelText('Qué mirar'), 'Temperatura máxima');
    const value = within(form).getByLabelText('Valor (°C)');
    await user.clear(value);
    await user.type(value, '80');
    await user.click(within(form).getByRole('button', { name: 'Crear regla' }));

    expect(await within(form).findByText('Usá un valor entre -30 y 50 °C.')).toBeInTheDocument();
    expect(within(form).getByLabelText('Valor (°C)')).toHaveAttribute('aria-invalid', 'true');
    expect(db.alertRules).toHaveLength(0);
  });

  it('over the plan cap says so, links the plans and keeps the session', async () => {
    const user0 = basico();
    const db = withAccount({
      user: user0,
      alertRules: [1, 2, 3].map((id) => rule({ id })),
    });
    const { user } = renderApp('/alertas', db);

    const form = await screen.findByRole('region', { name: 'Nueva regla' });
    expect(
      await within(screen.getByRole('region', { name: 'Tus reglas' })).findByText('3 de 3 reglas'),
    ).toBeInTheDocument();
    await user.click(await within(form).findByRole('button', { name: 'Crear regla' }));

    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Tu plan Básico permite hasta 3 reglas de alerta. Mirá los planes para sumar más.',
    );
    expect(within(alert).getByRole('link', { name: 'Ver planes' })).toHaveAttribute(
      'href',
      '/planes',
    );
    expect(screen.getByRole('heading', { name: 'Alertas' })).toBeInTheDocument();
    expect(db.user).not.toBeNull();
    expect(db.alertRules).toHaveLength(3);
  });

  it('asks for a lote first when there is none', async () => {
    renderApp('/alertas', withAccount({ lotes: [] }));

    const form = await screen.findByRole('region', { name: 'Nueva regla' });
    expect(
      await within(form).findByText('Para crear una regla primero cargá un lote.'),
    ).toBeInTheDocument();
    expect(within(form).getByRole('link', { name: 'Cargar un lote' })).toHaveAttribute(
      'href',
      '/lotes/nuevo',
    );
    expect(within(form).queryByRole('button', { name: 'Crear regla' })).not.toBeInTheDocument();
  });
});

describe('Tus reglas (S6, S4)', () => {
  it('pauses a rule with its switch', async () => {
    const db = withAccount({ alertRules: [rule({ id: 1 })] });
    const { user } = renderApp('/alertas', db);

    const rules = await screen.findByRole('region', { name: 'Tus reglas' });
    const toggle = await within(rules).findByRole('switch', {
      name: 'Mínima menor a 2 °C en Lote 4',
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    await waitFor(() => expect(db.alertRules[0]?.enabled).toBe(false));
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it('deletes a rule after confirming', async () => {
    const db = withAccount({ alertRules: [rule({ id: 1 })] });
    const { user } = renderApp('/alertas', db);

    const rules = await screen.findByRole('region', { name: 'Tus reglas' });
    await user.click(
      await within(rules).findByRole('button', { name: 'Borrar Mínima menor a 2 °C en Lote 4' }),
    );
    expect(db.alertRules).toHaveLength(1);
    await user.click(within(rules).getByRole('button', { name: 'Sí, borrar' }));

    await waitFor(() => expect(db.alertRules).toHaveLength(0));
    expect(
      await within(rules).findByText('Todavía no creaste reglas. Armá la primera abajo.'),
    ).toBeInTheDocument();
    expect(await within(rules).findByText('0 reglas')).toBeInTheDocument();
  });

  it('marks the rules beyond the plan as paused by the plan', async () => {
    const db = withAccount({
      user: basico(),
      alertRules: [1, 2, 3, 4].map((id) =>
        rule({ id, threshold: id, description: `Mínima menor a ${id} °C en Lote 4` }),
      ),
    });
    renderApp('/alertas', db);

    const rules = await screen.findByRole('region', { name: 'Tus reglas' });
    const items = await within(rules).findAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(items[3]!).getByText('Pausada por tu plan')).toBeInTheDocument();
    expect(within(rules).getAllByText('Pausada por tu plan')).toHaveLength(1);
  });
});

describe('Notificaciones en este teléfono (S7)', () => {
  const pushRegion = () => screen.findByRole('region', { name: 'Notificaciones en este teléfono' });

  it('explains that Básico has no push', async () => {
    renderApp('/alertas', withAccount({ user: basico() }));

    const region = await pushRegion();
    expect(
      await within(region).findByText('Tu plan Básico no incluye notificaciones push.'),
    ).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Ver planes' })).toHaveAttribute(
      'href',
      '/planes',
    );
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
  });

  it('explains when the browser cannot receive push, iPhone included', async () => {
    browser.pushSupported.mockReturnValue(false);
    renderApp('/alertas', withAccount());

    const region = await pushRegion();
    expect(
      await within(region).findByText('Este navegador no puede recibir notificaciones.'),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        'En iPhone llegan solo con la app instalada: en Safari tocá Compartir y después «Agregar a inicio».',
      ),
    ).toBeInTheDocument();
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
  });

  it('subscribes this phone only after the tap and the permission', async () => {
    const db = withAccount();
    const { user } = renderApp('/alertas', db);

    const region = await pushRegion();
    expect(await within(region).findByText('Desactivadas en este teléfono.')).toBeInTheDocument();
    expect(browser.requestPermission).not.toHaveBeenCalled();

    await user.click(within(region).getByRole('button', { name: 'Activar en este teléfono' }));

    expect(await within(region).findByText('Activadas en este teléfono.')).toBeInTheDocument();
    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.subscribeBrowser).toHaveBeenCalledWith(db.pushPublicKey);
    expect(db.pushSubscriptions).toEqual([SUBSCRIPTION]);
  });

  it('says notifications are blocked when the permission is denied', async () => {
    browser.requestPermission.mockResolvedValue('denied');
    const db = withAccount();
    const { user } = renderApp('/alertas', db);

    const region = await pushRegion();
    await user.click(
      await within(region).findByRole('button', { name: 'Activar en este teléfono' }),
    );

    expect(
      await within(region).findByText(
        'Las notificaciones están bloqueadas en el navegador. Habilitalas en los permisos del sitio y volvé a probar.',
      ),
    ).toBeInTheDocument();
    expect(browser.subscribeBrowser).not.toHaveBeenCalled();
    expect(db.pushSubscriptions).toEqual([]);
  });

  it('turns push off on this phone, in the browser and on the server', async () => {
    subscribedHere = ENDPOINT;
    const db = withAccount({ pushSubscriptions: [SUBSCRIPTION] });
    const { user } = renderApp('/alertas', db);

    const region = await pushRegion();
    await user.click(
      await within(region).findByRole('button', { name: 'Desactivar en este teléfono' }),
    );

    expect(await within(region).findByText('Desactivadas en este teléfono.')).toBeInTheDocument();
    expect(browser.unsubscribeBrowser).toHaveBeenCalled();
    expect(db.pushSubscriptions).toEqual([]);
  });

  it('turns the VAPID key into the bytes the browser wants', async () => {
    const actual = await vi.importActual<typeof import('../lib/push')>('../lib/push');
    expect(Array.from(actual.urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });
});

describe('Logout forgets this phone (S7)', () => {
  it('removes the push subscription before signing out', async () => {
    subscribedHere = ENDPOINT;
    const db = withAccount({ pushSubscriptions: [SUBSCRIPTION] });
    const { user } = renderApp('/perfil', db);

    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(db.pushSubscriptions).toEqual([]);
    expect(browser.unsubscribeBrowser).toHaveBeenCalled();
    expect(db.user).toBeNull();
  });

  it('still signs out with no signal', async () => {
    subscribedHere = ENDPOINT;
    const db = withAccount({ pushSubscriptions: [SUBSCRIPTION] });
    const { user } = renderApp('/perfil', db);
    server.use(
      http.delete('*/api/alertas/push/', () => HttpResponse.error()),
      http.post('*/api/auth/logout/', () => HttpResponse.error()),
    );

    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Como no había señal');
    expect(browser.unsubscribeBrowser).toHaveBeenCalled();
  });

  it('turns push on in this phone right from Perfil (perfil-ux S7)', async () => {
    const db = withAccount();
    const { user } = renderApp('/perfil', db);

    const avisos = await screen.findByRole('region', { name: 'Cómo te avisamos' });
    expect(
      await within(avisos).findByText('Este teléfono todavía no recibe notificaciones.'),
    ).toBeInTheDocument();
    expect(browser.requestPermission).not.toHaveBeenCalled();

    await user.click(within(avisos).getByRole('button', { name: 'Activar en este teléfono' }));

    expect(await within(avisos).findByText('Activadas en este teléfono.')).toBeInTheDocument();
    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(db.pushSubscriptions).toEqual([SUBSCRIPTION]);
    expect(within(avisos).queryByRole('button', { name: 'Activar en este teléfono' })).toBeNull();
  });

  it('tells Perfil how to unblock notifications the browser blocks (perfil-ux S7)', async () => {
    browser.permission.mockReturnValue('denied');
    renderApp('/perfil', withAccount());

    const avisos = await screen.findByRole('region', { name: 'Cómo te avisamos' });
    expect(
      await within(avisos).findByText(
        'Las notificaciones están bloqueadas en el navegador. Habilitalas en los permisos del sitio y volvé a probar.',
      ),
    ).toBeInTheDocument();
    expect(within(avisos).queryByRole('button', { name: 'Activar en este teléfono' })).toBeNull();
  });

  it('says nothing about this phone in Perfil when push is off (perfil-ux S7)', async () => {
    renderApp('/perfil', withAccount({ user: { ...demoUser, notify_push: false } }));

    const avisos = await screen.findByRole('region', { name: 'Cómo te avisamos' });
    expect(within(avisos).queryByText(/este teléfono/)).not.toBeInTheDocument();
  });
});
