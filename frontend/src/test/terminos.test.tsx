/// <reference types="node" />
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Plan, User } from '../api/types';
import { TERMS_VERSION } from '../lib/terms';
import { account, demoLotes, demoPlans, demoUser, planOf } from '../mocks/fixtures';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';

/** Clear terms (odd/tasks/promociones.md S0a-S0d). */

const TERMS_REQUIRED = 'Tenés que aceptar los términos y la política de privacidad.';
const VERSION_LINE = 'Versión 2026-11-19 · Vigente desde el 19 de noviembre de 2026';
const LEGAL = [
  ['Términos y condiciones', '/terminos'],
  ['Política de privacidad', '/privacidad'],
  ['Reglas del programa', '/reglas'],
] as const;

const priced: Plan[] = demoPlans.map((plan) => ({
  ...plan,
  price_ars_month: { basico: 0, productor: 14900, empresa: 49900 }[plan.code],
}));

const basicoUser = account({ id: 4, email: 'b@x.com', name: 'Beto', plan: planOf('basico') });
const pendingTerms = account({
  id: 8,
  email: 'nueva@x.com',
  name: 'Nora',
  terms_accepted: false,
});

const signedIn = (user: User, partial: Partial<MockDb> = {}) =>
  createMockDb({
    user,
    accounts: [{ email: user.email, password: 'pampa-humeda-2026', user }],
    lotes: demoLotes().slice(0, 1),
    ...partial,
  });

const legalList = () => screen.getByRole('list', { name: 'Términos y reglas' });

/** The three legal links, by name and address, inside `scope`. */
function expectLegalLinks(scope: HTMLElement) {
  for (const [name, href] of LEGAL) {
    expect(within(scope).getByRole('link', { name })).toHaveAttribute('href', href);
  }
}

describe('Las páginas (S0a)', () => {
  it('shows the terms with their version and every missing business datum in brackets', async () => {
    renderApp('/terminos', createMockDb());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Términos y condiciones' }),
    ).toBeInTheDocument();
    expect(screen.getByText(VERSION_LINE)).toBeInTheDocument();
    for (const datum of [
      'RAZÓN SOCIAL',
      'CUIT',
      'DOMICILIO',
      'EMAIL DE CONTACTO',
      'JURISDICCIÓN',
    ]) {
      expect(screen.getAllByText(`[${datum}]`).length).toBeGreaterThan(0);
    }
    const body = document.body.textContent ?? '';
    expect(body).toContain('Ley 24.240');
    expect(body).toContain('«Darme de baja»');
    expect(body).toContain('se renueva automáticamente');
    expectLegalLinks(legalList());
  });

  it('shows the privacy policy under Ley 25.326 with what the app collects', async () => {
    renderApp('/privacidad', createMockDb());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' }),
    ).toBeInTheDocument();
    expect(screen.getByText(VERSION_LINE)).toBeInTheDocument();
    for (const datum of ['RAZÓN SOCIAL', 'CUIT', 'DOMICILIO', 'EMAIL DE CONTACTO']) {
      expect(screen.getAllByText(`[${datum}]`).length).toBeGreaterThan(0);
    }
    const body = document.body.textContent ?? '';
    expect(body).toContain('Ley 25.326');
    for (const collected of [
      'Lotes:',
      'Alertas:',
      'Notificaciones push:',
      'Pagos:',
      'Mercado Pago',
      'Open-Meteo',
      'Georef AR',
    ]) {
      expect(body).toContain(collected);
    }
  });

  it('states the founder and subscription rules as S0 lists them', async () => {
    renderApp('/reglas', createMockDb());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reglas del programa' }),
    ).toBeInTheDocument();
    expect(screen.getByText(VERSION_LINE)).toBeInTheDocument();
    const founders = screen.getByRole('region', { name: '1. Founders' });
    for (const rule of [
      '«Gratis para siempre» significa el plan Productor sin cargo, mientras el servicio exista.',
      'Puede pasar al plan Empresa pagando solo la diferencia entre el precio de Empresa y el de Productor, por mes, con Mercado Pago.',
      'Si se da de baja de Empresa, la cuenta vuelve a Productor sin cargo.',
    ]) {
      expect(within(founders).getByText(rule)).toBeInTheDocument();
    }
    expect(within(founders).getByText(/personal e intransferible/)).toBeInTheDocument();
    const paid = screen.getByRole('region', { name: '3. Suscripciones pagas' });
    for (const rule of [
      /mensuales, se renuevan automáticamente y se cobran en pesos a través de Mercado Pago/,
      /se conserva el mes ya pagado/,
      /pausada o cancelada conserva el plan hasta el final del mes pagado/,
      /una sola suscripción paga a la vez/,
      /Los precios pueden cambiar. Cada cambio se avisa antes/,
    ]) {
      expect(within(paid).getByText(rule)).toBeInTheDocument();
    }
  });

  it('opens the pages signed in, even before accepting a new version', async () => {
    renderApp('/terminos', signedIn(pendingTerms));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Términos y condiciones' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Actualizamos los términos' })).toBeNull();
  });

  it('shows the same version as the backend', () => {
    const backend = readFileSync(
      resolve(process.cwd(), '../backend/apps/accounts/terms.py'),
      'utf8',
    );
    expect(backend).toMatch(new RegExp(`^TERMS_VERSION = "${TERMS_VERSION}"$`, 'm'));
  });

  it.each(['/ingresar', '/crear-cuenta'])(
    'links the pages from the footer of %s',
    async (route) => {
      renderApp(route, createMockDb());

      expectLegalLinks(await screen.findByRole('list', { name: 'Términos y reglas' }));
    },
  );

  it('links the pages from Perfil, Planes and Suscripción', async () => {
    const db = signedIn(basicoUser, { plans: priced, paymentsEnabled: true });
    const first = renderApp('/perfil', db);
    await screen.findByRole('region', { name: 'Tus datos' });
    expectLegalLinks(legalList());
    first.unmount();

    const second = renderApp('/planes', db);
    await screen.findByRole('heading', { name: 'Planes' });
    await screen.findAllByRole('article');
    expectLegalLinks(legalList());
    second.unmount();

    renderApp('/perfil/suscripcion', db);
    await screen.findByRole('region', { name: 'Cambiar de plan' });
    expectLegalLinks(legalList());
  });
});

describe('Aceptar al crear la cuenta (S0b)', () => {
  it('refuses the sign-up without the box, in the API’s words, and accepts it ticked', async () => {
    const db = createMockDb();
    const { user } = renderApp('/crear-cuenta', db);

    await user.type(await screen.findByLabelText('Nombre'), 'Juan Pérez');
    await user.type(screen.getByLabelText('Email'), 'juan@campo.com.ar');
    await user.type(screen.getByLabelText('Contraseña'), 'alambrado-99');
    const box = screen.getByRole('checkbox', {
      name: 'Leí y acepto los Términos y condiciones, la Política de privacidad y las Reglas del programa.',
    });
    expect(box).not.toBeChecked();
    expectLegalLinks(box.closest('.terms-check') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText(TERMS_REQUIRED)).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(db.user).toBeNull();
    expect(db.accounts).toEqual([]);
    expect(db.termsAcceptances).toEqual([]);

    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Mis lotes' })).toBeInTheDocument();
    expect(db.termsAcceptances).toEqual([{ userId: db.user!.id, context: 'signup' }]);
  });
});

describe('Términos actualizados (S0c)', () => {
  const dialog = () => screen.findByRole('dialog', { name: 'Actualizamos los términos' });

  it('blocks a signed-in account that has not accepted the current version', async () => {
    renderApp('/lotes', signedIn(pendingTerms));

    const modal = await dialog();
    expect(modal).toHaveAttribute('open');
    expect(modal).toHaveTextContent('vigente desde el 19 de noviembre de 2026');
    expectLegalLinks(modal);
    expect(within(modal).getByRole('button', { name: 'Acepto' })).toHaveFocus();
    // Esc does nothing, and a close forced by the browser opens it again.
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(modal, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    (modal as HTMLDialogElement).close();
    expect(modal).toHaveAttribute('open');
  });

  it('shows it to an existing founder too, on any screen of the app', async () => {
    renderApp('/', signedIn({ ...demoUser, terms_accepted: false }));

    expect(await dialog()).toHaveAttribute('open');
  });

  it('records the acceptance and lets the account in', async () => {
    const db = signedIn(pendingTerms);
    const { user } = renderApp('/lotes', db);

    await user.click(within(await dialog()).getByRole('button', { name: 'Acepto' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Actualizamos los términos' })).toBeNull(),
    );
    expect(db.termsAcceptances).toEqual([{ userId: pendingTerms.id, context: 'update' }]);
    expect(db.user).toMatchObject({ terms_accepted: true });
    expect(db.unsafeRequests.at(-1)).toMatchObject({
      path: '/api/auth/terminos/aceptar/',
      csrf: db.csrfToken,
    });
    expect(screen.getByRole('heading', { name: 'Mis lotes' })).toBeInTheDocument();
  });

  it('signs out with Salir, like Perfil', async () => {
    const db = signedIn(pendingTerms);
    const { user } = renderApp('/lotes', db);

    await user.click(within(await dialog()).getByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
    expect(db.user).toBeNull();
    expect(db.termsAcceptances).toEqual([]);
    expect(screen.queryByRole('dialog', { name: 'Actualizamos los términos' })).toBeNull();
  });

  it.each([
    ['accepted', true],
    ['unknown in an older saved account', undefined],
  ])('does not show when the terms are %s', async (_, accepted) => {
    renderApp('/lotes', signedIn({ ...pendingTerms, terms_accepted: accepted }));

    expect(await screen.findByRole('heading', { name: 'Mis lotes' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Actualizamos los términos' })).toBeNull();
  });
});

describe('Resumen antes de pagar (S0d)', () => {
  const ROUTE = '/perfil/suscripcion';
  const sentTo = (db: MockDb, path: string) => db.sent.filter((r) => r.path === path);
  const summary = () => screen.findByRole('dialog', { name: 'Antes de ir a Mercado Pago' });

  function stubLocation() {
    const assign = vi.fn();
    const { origin, href, pathname, search, hash, host, hostname, protocol, port } =
      window.location;
    vi.stubGlobal('location', {
      origin,
      href,
      pathname,
      search,
      hash,
      host,
      hostname,
      protocol,
      port,
      assign,
    });
    return assign;
  }

  async function openSummary(user: ReturnType<typeof renderApp>['user'], plan: string) {
    const change = await screen.findByRole('region', { name: 'Cambiar de plan' });
    const card = within(change).getByRole('article', { name: `Plan ${plan}` });
    await user.click(within(card).getByRole('button', { name: 'Suscribirme' }));
    return summary();
  }

  it('says the amount, the renewal, the first charge and how to leave before anything is sent', async () => {
    const db = signedIn(basicoUser, { plans: priced, paymentsEnabled: true });
    const { user } = renderApp(ROUTE, db);

    const modal = await openSummary(user, 'Productor');

    for (const line of [
      'Pagás $ 14.900 por mes, en pesos, con Mercado Pago.',
      'Se renueva automáticamente todos los meses, hasta que te des de baja.',
      'El primer cobro es ahora, cuando confirmás el pago en Mercado Pago.',
      'Te podés dar de baja cuando quieras con «Darme de baja», en esta misma página.',
      'Si te das de baja, conservás el mes que ya pagaste y no te cobramos más.',
    ]) {
      expect(within(modal).getByText(line)).toBeInTheDocument();
    }
    expect(within(modal).getByText('Plan Productor')).toBeInTheDocument();
    expect(within(modal).getByRole('checkbox', { name: /Leí y acepto/ })).not.toBeChecked();
    expect(within(modal).getByRole('button', { name: 'Ahora no' })).toHaveFocus();
    expect(sentTo(db, '/api/pagos/suscribirme/')).toEqual([]);
  });

  it('creates nothing without the terms and says why', async () => {
    const assign = stubLocation();
    const db = signedIn(basicoUser, { plans: priced, paymentsEnabled: true });
    const { user } = renderApp(ROUTE, db);

    const modal = await openSummary(user, 'Productor');
    await user.click(within(modal).getByRole('button', { name: 'Ir a Mercado Pago' }));

    expect(await within(modal).findByText(TERMS_REQUIRED)).toBeInTheDocument();
    expect(within(modal).getByRole('checkbox', { name: /Leí y acepto/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(sentTo(db, '/api/pagos/suscribirme/').map((r) => r.body)).toEqual([
      { plan: 'productor', currency: 'ARS', acepta_terminos: false },
    ]);
    expect(db.termsAcceptances).toEqual([]);
    expect(assign).not.toHaveBeenCalled();
  });

  it('creates the subscription only after the box and the button', async () => {
    const assign = stubLocation();
    const db = signedIn(basicoUser, { plans: priced, paymentsEnabled: true });
    const { user } = renderApp(ROUTE, db);

    const modal = await openSummary(user, 'Empresa');
    expect(
      within(modal).getByText('Pagás $ 49.900 por mes, en pesos, con Mercado Pago.'),
    ).toBeInTheDocument();
    await user.click(within(modal).getByRole('checkbox', { name: /Leí y acepto/ }));
    await user.click(within(modal).getByRole('button', { name: 'Ir a Mercado Pago' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(db.checkoutUrl));
    expect(sentTo(db, '/api/pagos/suscribirme/').map((r) => r.body)).toEqual([
      { plan: 'empresa', currency: 'ARS', acepta_terminos: true },
    ]);
    expect(db.termsAcceptances).toEqual([{ userId: basicoUser.id, context: 'subscribe' }]);
  });

  it('closes with Ahora no and sends nothing', async () => {
    const db = signedIn(basicoUser, { plans: priced, paymentsEnabled: true });
    const { user } = renderApp(ROUTE, db);

    const modal = await openSummary(user, 'Productor');
    await user.click(within(modal).getByRole('button', { name: 'Ahora no' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Antes de ir a Mercado Pago' })).toBeNull(),
    );
    expect(sentTo(db, '/api/pagos/suscribirme/')).toEqual([]);
  });

  it('tells a founder the amount is the difference with Productor', async () => {
    const db = signedIn(demoUser, { plans: priced, paymentsEnabled: true });
    const { user } = renderApp(ROUTE, db);

    const modal = await openSummary(user, 'Empresa');

    expect(
      within(modal).getByText(
        'Pagás $ 35.000 por mes, en pesos, con Mercado Pago. Es la diferencia con Productor, que seguís teniendo gratis.',
      ),
    ).toBeInTheDocument();
  });
});
