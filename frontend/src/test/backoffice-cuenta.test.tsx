import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActionRow, BackofficeActionKind } from '../api/backoffice';
import type { User } from '../api/types';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';

/** The account record of the backoffice (backoffice-superadmin S1-S4) and its log labels. */

const admin: User = { ...demoUser, is_superuser: true };
const JUAN = '/backoffice?seccion=cuentas&cuenta=21';
const MARTA = '/backoffice?seccion=cuentas&cuenta=22';
const OWN = '/backoffice?seccion=cuentas&cuenta=1';

const dbFor = (partial: Partial<MockDb> = {}) =>
  createMockDb({ user: admin, lotes: demoLotes().slice(0, 1), ...partial });

const posts = (db: MockDb) =>
  db.sent.filter((r) => r.path.startsWith('/api/backoffice/') && r.method !== 'GET');

async function openRecord(route: string, db: MockDb) {
  const utils = renderApp(route, db);
  const record = await screen.findByRole('article', { name: /Ficha de/ });
  return { ...utils, record };
}

/** The figure next to a label in one of the record's fact lists. */
const fact = (scope: HTMLElement, label: string) =>
  within(scope).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

async function confirm(
  user: ReturnType<typeof renderApp>['user'],
  record: HTMLElement,
  button: string,
  dialogName: string | RegExp,
  confirmLabel: string,
  /** Text the dialog explains before anything is sent. */
  explains?: string,
) {
  await user.click(within(record).getByRole('button', { name: button }));
  const dialog = screen.getByRole('dialog', { name: dialogName });
  if (explains) expect(dialog).toHaveTextContent(explains);
  await user.click(within(dialog).getByRole('button', { name: confirmLabel }));
  return dialog;
}

describe('The account record (S1)', () => {
  it('opens from the Cuentas list at ?cuenta=<id> and goes back', async () => {
    const db = dbFor();
    const { user } = renderApp('/backoffice?seccion=cuentas', db);

    const table = await screen.findByRole('table', { name: 'Cuentas' });
    await user.click(within(table).getByRole('link', { name: 'Juan Gómez' }));

    const record = await screen.findByRole('article', { name: 'Ficha de Juan Gómez' });
    expect(within(record).getByRole('heading', { level: 2, name: 'Juan Gómez' })).toBeVisible();
    expect(db.sent.at(-1)?.path).toBe('/api/backoffice/cuentas/21/');

    await user.click(screen.getByRole('link', { name: 'Todas las cuentas' }));
    expect(await screen.findByRole('table', { name: 'Cuentas' })).toBeInTheDocument();
  });

  it('shows the profile, plan history, Mercado Pago, lotes and alerts', async () => {
    const { record } = await openRecord(JUAN, dbFor());

    expect(within(record).getByText('juan@elombu.com.ar')).toBeInTheDocument();
    const data = within(record).getByRole('region', { name: 'Datos' });
    expect(fact(data, 'Plan')).toBe('Productor');
    expect(fact(data, 'Estado')).toBe('En prueba hasta el 2 de diciembre de 2026');
    expect(fact(data, 'Acceso')).toBe('Puede entrar');
    expect(fact(data, 'Alta')).toBe('2 de noviembre de 2026');

    const history = within(record).getByRole('table', { name: 'Historial de planes' });
    const [change] = within(history).getAllByRole('row').slice(1);
    expect(change).toHaveTextContent('Alta con prueba de Productor');
    expect(change).toHaveTextContent('Productor');

    const subs = within(record).getByRole('table', { name: 'Suscripciones' });
    expect(within(subs).getAllByRole('row')[1]).toHaveTextContent('Activa');
    expect(within(subs).getAllByRole('row')[1]).toHaveTextContent('2c938084-mock');
    const payments = within(record).getByRole('table', { name: 'Pagos' });
    expect(within(payments).getAllByRole('row')[1]).toHaveTextContent('$ 14.900');

    const lotes = within(record).getByRole('list', { name: 'Lotes' });
    expect(
      within(lotes)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('La Loma'), expect.stringContaining('El Bajo')]);
    const alerts = within(record).getByRole('list', { name: 'Reglas de alerta' });
    expect(within(alerts).getByRole('listitem')).toHaveTextContent(
      'Helada en el suelo · La Loma · Activa',
    );
  });

  it('says when an account has no subscription, lotes or alerts', async () => {
    const { record } = await openRecord(MARTA, dbFor());

    expect(within(record).getByText('Sin suscripciones con Mercado Pago.')).toBeInTheDocument();
    expect(within(record).getByText('Sin lotes.')).toBeInTheDocument();
    expect(within(record).getByText('Sin reglas de alerta.')).toBeInTheDocument();
    expect(
      within(record).queryByRole('button', { name: 'Sincronizar con Mercado Pago' }),
    ).toBeNull();
  });

  it('answers an unknown account as the API does', async () => {
    renderApp('/backoffice?seccion=cuentas&cuenta=999', dbFor());

    expect(await screen.findByText('No encontrado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Todas las cuentas' })).toBeInTheDocument();
  });

  it('edits the name and the email', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(JUAN, db);

    await user.click(within(record).getByRole('button', { name: 'Editar nombre y email' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar los datos de Juan Gómez' });
    const name = within(dialog).getByLabelText(/^Nombre/);
    const email = within(dialog).getByLabelText(/^Email/);
    expect(name).toHaveValue('Juan Gómez');
    await user.clear(name);
    await user.type(name, 'Juan Pablo Gómez');
    await user.clear(email);
    await user.type(email, 'Juan@ElOmbu.com.ar');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(record).findByText('Guardamos los datos de Juan Pablo Gómez.'),
    ).toBeInTheDocument();
    expect(posts(db).at(-1)).toEqual({
      method: 'PATCH',
      path: '/api/backoffice/cuentas/21/',
      body: { name: 'Juan Pablo Gómez', email: 'Juan@ElOmbu.com.ar' },
    });
    expect(db.unsafeRequests.at(-1)).toMatchObject({ method: 'PATCH', csrf: db.csrfToken });
    expect(
      await within(record).findByRole('heading', { level: 2, name: 'Juan Pablo Gómez' }),
    ).toBeVisible();
    expect(within(record).getByText('juan@elombu.com.ar')).toBeInTheDocument();
    expect(db.backoffice.actions[0]).toMatchObject({
      action: 'account_update',
      payload: {
        before: { name: 'Juan Gómez' },
        after: { name: 'Juan Pablo Gómez' },
      },
    });
  });

  it('shows an email in use next to the field', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(JUAN, db);

    await user.click(within(record).getByRole('button', { name: 'Editar nombre y email' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar los datos de Juan Gómez' });
    await user.clear(within(dialog).getByLabelText(/^Email/));
    await user.type(within(dialog).getByLabelText(/^Email/), 'MARTA@sancayetano.com.ar');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByText('Ya hay una cuenta con ese email.')).toBeVisible();
    expect(within(dialog).getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(db.backoffice.actions[0]?.action).toBe('price_update');
  });
});

describe('Access control (S2)', () => {
  it('blocks and unblocks an account after confirming', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(JUAN, db);

    const dialog = await confirm(
      user,
      record,
      'Bloquear cuenta',
      '¿Bloquear la cuenta de Juan Gómez?',
      'Bloquear',
      'La suscripción de Mercado Pago sigue activa',
    );
    expect(await within(record).findByText('Bloqueamos la cuenta de Juan Gómez.')).toBeVisible();
    expect(dialog).not.toHaveAttribute('open');
    expect(fact(within(record).getByRole('region', { name: 'Datos' }), 'Acceso')).toBe('Bloqueada');
    expect(posts(db).at(-1)?.path).toBe('/api/backoffice/cuentas/21/bloquear/');

    await confirm(
      user,
      record,
      'Desbloquear cuenta',
      '¿Desbloquear la cuenta de Juan Gómez?',
      'Desbloquear',
    );
    expect(await within(record).findByText('Desbloqueamos la cuenta de Juan Gómez.')).toBeVisible();
    expect(db.backoffice.actions.slice(0, 2).map((a) => a.action)).toEqual([
      'account_unblock',
      'account_block',
    ]);
  });

  it('keeps Cancel as the safe default of a confirmation', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(JUAN, db);

    await user.click(within(record).getByRole('button', { name: 'Bloquear cuenta' }));
    const dialog = screen.getByRole('dialog', { name: '¿Bloquear la cuenta de Juan Gómez?' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(posts(db)).toEqual([]);
  });

  it('grants and revokes super admin', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(JUAN, db);

    await confirm(
      user,
      record,
      'Dar super admin',
      '¿Dar super admin a Juan Gómez?',
      'Dar super admin',
    );
    expect(await within(record).findByText('Juan Gómez ahora es super admin.')).toBeVisible();
    expect(within(record).getByText('Super admin', { selector: '.chip' })).toBeVisible();

    await confirm(
      user,
      record,
      'Quitar super admin',
      '¿Quitar super admin a Juan Gómez?',
      'Quitar super admin',
    );
    expect(await within(record).findByText('Juan Gómez ya no es super admin.')).toBeVisible();
    expect(posts(db).map((r) => r.path)).toEqual([
      '/api/backoffice/cuentas/21/superadmin/dar/',
      '/api/backoffice/cuentas/21/superadmin/quitar/',
    ]);
  });

  it('offers neither block nor revoke on your own account', async () => {
    const { record } = await openRecord(OWN, dbFor());

    expect(within(record).queryByRole('button', { name: 'Bloquear cuenta' })).toBeNull();
    expect(within(record).queryByRole('button', { name: 'Quitar super admin' })).toBeNull();
    expect(
      within(record).getByText('Es tu cuenta: no podés bloquearla ni quitarte el super admin.'),
    ).toBeVisible();
  });

  it('sends the password-reset email, once per cooldown', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(JUAN, db);
    const button = 'Mandar mail para restablecer la contraseña';
    const title = '¿Mandar el mail para restablecer la contraseña?';

    await confirm(user, record, button, title, 'Mandar mail');
    expect(
      await within(record).findByText('Le mandamos el mail a juan@elombu.com.ar.'),
    ).toBeVisible();

    const dialog = await confirm(user, record, button, title, 'Mandar mail');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ya le mandamos un mail hace menos de 10 minutos. Probá de nuevo más tarde.',
    );
    expect(db.backoffice.actions.filter((a) => a.action === 'password_reset')).toHaveLength(1);
  });
});

describe('Plan and founder by hand (S3)', () => {
  it('gives a trial until a date', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(MARTA, db);

    await user.click(within(record).getByRole('button', { name: 'Dar o extender prueba' }));
    const dialog = screen.getByRole('dialog', { name: 'Prueba de Productor para Marta Ríos' });
    fireEvent.change(within(dialog).getByLabelText(/^Hasta el día/), {
      target: { value: '2099-12-31' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Dar prueba' }));

    expect(
      await within(record).findByText(
        'Marta Ríos tiene Productor hasta el 31 de diciembre de 2099.',
      ),
    ).toBeVisible();
    expect(posts(db).at(-1)).toEqual({
      method: 'POST',
      path: '/api/backoffice/cuentas/22/prueba/',
      body: { hasta: '2099-12-31' },
    });
    const data = within(record).getByRole('region', { name: 'Datos' });
    expect(fact(data, 'Plan')).toBe('Productor');
    expect(fact(data, 'Estado')).toBe('En prueba hasta el 31 de diciembre de 2099');
  });

  it('shows a past date refused next to the field', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(MARTA, db);

    await user.click(within(record).getByRole('button', { name: 'Dar o extender prueba' }));
    const dialog = screen.getByRole('dialog', { name: 'Prueba de Productor para Marta Ríos' });
    fireEvent.change(within(dialog).getByLabelText(/^Hasta el día/), {
      target: { value: '2020-01-01' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Dar prueba' }));

    expect(await within(dialog).findByText('La fecha tiene que ser futura.')).toBeVisible();
  });

  it('refuses a trial or a founder to an account that is paying', async () => {
    const db = dbFor({ paymentsEnabled: true });
    const juan = db.backoffice.subscriptions.find((s) => s.user.id === 21);
    expect(juan?.status).toBe('authorized');
    const { user, record } = await openRecord(JUAN, db);

    await user.click(within(record).getByRole('button', { name: 'Dar o extender prueba' }));
    const trial = screen.getByRole('dialog', { name: /^Prueba de Productor para/ });
    fireEvent.change(within(trial).getByLabelText(/^Hasta el día/), {
      target: { value: '2099-12-31' },
    });
    await user.click(within(trial).getByRole('button', { name: 'Dar prueba' }));
    expect(await within(trial).findByRole('alert')).toHaveTextContent(
      'La cuenta tiene una suscripción paga: cancelala primero.',
    );
    await user.click(within(trial).getByRole('button', { name: 'Cancelar' }));

    const founder = await confirm(
      user,
      record,
      'Marcar founder',
      '¿Marcar a Juan Gómez como founder?',
      'Marcar founder',
    );
    expect(await within(founder).findByRole('alert')).toHaveTextContent(
      'La cuenta tiene una suscripción paga: cancelala primero.',
    );
    expect(db.backoffice.actions.some((a) => a.target_user?.id === 21)).toBe(false);
  });

  it('offers no trial to a founder', async () => {
    const { record } = await openRecord(OWN, dbFor());

    expect(within(record).queryByRole('button', { name: 'Dar o extender prueba' })).toBeNull();
  });

  it('marks a founder with the quota in view, then removes it', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(MARTA, db);

    await user.click(within(record).getByRole('button', { name: 'Marcar founder' }));
    const dialog = screen.getByRole('dialog', { name: '¿Marcar a Marta Ríos como founder?' });
    expect(await within(dialog).findByText(/Quedan 93 lugares de founder/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Marcar founder' }));

    expect(await within(record).findByText('Marta Ríos es founder n.º 8.')).toBeVisible();
    expect(fact(within(record).getByRole('region', { name: 'Datos' }), 'Estado')).toBe(
      'Founder n.º 8',
    );

    await confirm(
      user,
      record,
      'Quitar founder',
      '¿Quitar founder a Marta Ríos?',
      'Quitar founder',
    );
    expect(await within(record).findByText('Marta Ríos ya no es founder.')).toBeVisible();
    expect(db.backoffice.actions.slice(0, 2).map((a) => [a.action, a.payload])).toEqual([
      ['founder_revoke', { number: 8 }],
      ['founder_grant', { number: 8, from_plan: 'basico' }],
    ]);
  });

  it('still changes the plan from the record', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(MARTA, db);

    await user.click(within(record).getByRole('button', { name: 'Cambiar plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambiar el plan de Marta Ríos' });
    await user.selectOptions(within(dialog).getByLabelText('Plan nuevo'), 'empresa');
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar plan' }));

    expect(await within(record).findByText('Marta Ríos pasó al plan Empresa.')).toBeVisible();
    await waitFor(() =>
      expect(fact(within(record).getByRole('region', { name: 'Datos' }), 'Plan')).toBe('Empresa'),
    );
  });
});

describe('Mercado Pago from the panel (S4)', () => {
  it('syncs the subscription with Mercado Pago', async () => {
    const db = dbFor({ paymentsEnabled: true });
    db.backoffice.mercadoPago.remote['2c938084-mock'] = 'paused';
    const { user, record } = await openRecord(JUAN, db);

    await confirm(
      user,
      record,
      'Sincronizar con Mercado Pago',
      '¿Sincronizar la suscripción de Juan Gómez?',
      'Sincronizar',
    );

    expect(
      await within(record).findByText('Sincronizamos la suscripción: quedó Pausada.'),
    ).toBeVisible();
    const subs = within(record).getByRole('table', { name: 'Suscripciones' });
    expect(within(subs).getAllByRole('row')[1]).toHaveTextContent('Pausada');
    expect(posts(db).at(-1)?.path).toBe('/api/backoffice/cuentas/21/suscripcion/sincronizar/');
  });

  it('shows a Mercado Pago failure in the dialog', async () => {
    const db = dbFor({ paymentsEnabled: true });
    db.backoffice.mercadoPago.down = true;
    const { user, record } = await openRecord(JUAN, db);

    const dialog = await confirm(
      user,
      record,
      'Sincronizar con Mercado Pago',
      '¿Sincronizar la suscripción de Juan Gómez?',
      'Sincronizar',
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.',
    );
  });

  it('says when payments are not configured', async () => {
    const db = dbFor({ paymentsEnabled: false });
    const { user, record } = await openRecord(JUAN, db);

    const dialog = await confirm(
      user,
      record,
      'Sincronizar con Mercado Pago',
      '¿Sincronizar la suscripción de Juan Gómez?',
      'Sincronizar',
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Los pagos todavía no están habilitados.',
    );
  });

  it('cancels the subscription', async () => {
    const db = dbFor({ paymentsEnabled: true });
    const { user, record } = await openRecord(JUAN, db);

    await confirm(
      user,
      record,
      'Cancelar suscripción',
      '¿Cancelar la suscripción de Juan Gómez?',
      'Cancelar suscripción',
      'Sigue con Productor hasta el fin del mes pago',
    );

    expect(
      await within(record).findByText('Cancelamos la suscripción de Juan Gómez.'),
    ).toBeVisible();
    const subs = within(record).getByRole('table', { name: 'Suscripciones' });
    expect(within(subs).getAllByRole('row')[1]).toHaveTextContent('Cancelada');
    expect(within(record).queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull();
  });
});

describe('Registro labels for the new actions', () => {
  const person = { id: 21, name: 'Juan Gómez', email: 'juan@elombu.com.ar' };
  const cases: [BackofficeActionKind, ActionRow['payload'], string][] = [
    [
      'account_update',
      {
        before: { name: 'Juan', email: 'j@x.com' },
        after: { name: 'Juan Gómez', email: 'juan@x.com' },
      },
      'Datos editados: nombre «Juan» → «Juan Gómez»; email j@x.com → juan@x.com',
    ],
    ['account_block', {}, 'Cuenta bloqueada'],
    ['account_unblock', {}, 'Cuenta desbloqueada'],
    ['superadmin_grant', {}, 'Super admin dado'],
    ['superadmin_revoke', {}, 'Super admin quitado'],
    ['password_reset', {}, 'Mail para restablecer la contraseña'],
    [
      'trial_grant',
      { until: '2026-12-01', from_plan: 'basico' },
      'Prueba de Productor hasta el 1 de diciembre de 2026 (venía de Básico)',
    ],
    ['founder_grant', { number: 8, from_plan: 'productor' }, 'Founder n.º 8 (venía de Productor)'],
    ['founder_revoke', { number: 3 }, 'Founder n.º 3 quitado'],
    [
      'subscription_sync',
      { subscription: 'abc', before: 'pending', after: 'authorized', payments: 2 },
      'Suscripción sincronizada con Mercado Pago: Esperando el pago → Activa; 2 pagos',
    ],
    [
      'subscription_cancel',
      { subscription: 'abc', before: 'authorized', after: 'cancelled' },
      'Suscripción cancelada desde el backoffice: Activa → Cancelada',
    ],
    ['export', { file: 'cuentas.csv', rows: 12 }, 'Exportación CSV: cuentas.csv (12 filas)'],
  ];

  it('describes every new action in words', async () => {
    const db = dbFor();
    db.backoffice.actions = cases.map(([action, payload], index) => ({
      id: 500 + index,
      action,
      actor: person,
      target_user: action === 'export' ? null : person,
      payload,
      at: '2026-11-19T12:00:00Z',
    }));
    renderApp('/backoffice?seccion=registro', db);

    const table = await screen.findByRole('table', { name: 'Registro' });
    const what = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    expect(what).toEqual(cases.map(([, , text]) => text));
  });
});
