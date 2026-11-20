import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActionRow, BackofficeActionKind, RecordCourtesy } from '../api/backoffice';
import type { PlanChange, User } from '../api/types';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { tomorrowInBuenosAires } from '../pages/backoffice/format';
import { renderApp } from './renderApp';

/** Cortesías in the backoffice (odd/tasks/cortesias.md, S5): give, refuse, revoke, log. */

const admin: User = { ...demoUser, is_superuser: true };
const ANA = '/backoffice?seccion=cuentas&cuenta=1';
const JUAN = '/backoffice?seccion=cuentas&cuenta=21';
const MARTA = '/backoffice?seccion=cuentas&cuenta=22';
const DAY = 86_400_000;

const dbFor = (partial: Partial<MockDb> = {}) =>
  createMockDb({ user: admin, lotes: demoLotes().slice(0, 1), ...partial });

const writes = (db: MockDb) =>
  db.sent.filter((r) => r.path.startsWith('/api/backoffice/') && r.method !== 'GET');

/** `YYYY-MM-DD` this many days from today in Buenos Aires. */
const daysAhead = (days: number) => tomorrowInBuenosAires(Date.now() + (days - 1) * DAY);

async function openRecord(route: string, db: MockDb) {
  const utils = renderApp(route, db);
  const record = await screen.findByRole('article', { name: /Ficha de/ });
  return { ...utils, record };
}

const fact = (scope: HTMLElement, label: string) =>
  within(scope).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

const planSection = (record: HTMLElement) =>
  within(record).getByRole('region', { name: 'Plan y founder' });

async function openGrant(user: ReturnType<typeof renderApp>['user'], record: HTMLElement) {
  await user.click(within(record).getByRole('button', { name: 'Dar cortesía' }));
  return screen.getByRole('dialog', { name: /^Cortesía para / });
}

function fillGrant(dialog: HTMLElement, until: string, reason: string) {
  fireEvent.change(within(dialog).getByLabelText(/^Hasta el día/), { target: { value: until } });
  fireEvent.change(within(dialog).getByLabelText(/^Motivo/), { target: { value: reason } });
}

/** An Empresa cortesía given by Ana five days ago. */
const courtesyUntil = (until: string): RecordCourtesy => ({
  plan: { code: 'empresa', name: 'Empresa' },
  starts_at: new Date(Date.now() - 5 * DAY).toISOString(),
  ends_at: new Date(`${until}T23:59:59-03:00`).toISOString(),
  reason: 'Cooperativa piloto',
  granted_by: { id: 1, name: 'Ana Ferreyra', email: 'ana@lacampana.com.ar' },
});

/** Marta (Básico) on that cortesía until 60 days from today. */
function withCourtesy(db: MockDb) {
  const courtesy = courtesyUntil(daysAhead(60));
  const marta = db.backoffice.accounts.find((a) => a.id === 22)!;
  Object.assign(marta, { plan: courtesy.plan, status: 'trial' });
  db.backoffice.records[22] = {
    plan_expires_at: courtesy.ends_at,
    is_active: true,
    plan_changes: [],
    lotes: [],
    alert_rules: [],
    courtesy,
  };
}

describe('Give a cortesía (S5)', () => {
  it('gives a paid plan for free until a date, with a reason', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(MARTA, db);
    const until = daysAhead(30);

    const dialog = await openGrant(user, record);
    expect(dialog).toHaveTextContent('Ahora está en Básico.');
    const date = within(dialog).getByLabelText(/^Hasta el día/);
    expect(date).toHaveAttribute('type', 'date');
    expect(date).toHaveAttribute('min', tomorrowInBuenosAires());
    expect(date).toHaveAttribute('max', daysAhead(365));
    const plan = within(dialog).getByLabelText('Plan');
    expect(
      within(plan)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Productor', 'Empresa']);
    await user.selectOptions(plan, 'empresa');
    fillGrant(dialog, until, '  Cooperativa piloto  ');
    await user.click(within(dialog).getByRole('button', { name: 'Dar cortesía' }));

    const ends = new Date(`${until}T23:59:59-03:00`);
    const day = new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(ends);
    expect(
      await within(record).findByText(`Marta Ríos tiene Empresa de cortesía hasta el ${day}.`),
    ).toBeVisible();
    expect(writes(db)).toEqual([
      {
        method: 'POST',
        path: '/api/backoffice/cuentas/22/cortesia/',
        body: { plan: 'empresa', hasta: until, motivo: 'Cooperativa piloto' },
      },
    ]);
    expect(db.unsafeRequests.at(-1)).toMatchObject({ method: 'POST', csrf: db.csrfToken });

    const data = within(record).getByRole('region', { name: 'Datos' });
    expect(fact(data, 'Plan')).toBe('Empresa');
    expect(fact(data, 'Estado')).toBe(`Cortesía de Empresa hasta el ${day}`);
    const plans = planSection(record);
    expect(fact(plans, 'Cortesía')).toBe('Empresa');
    expect(fact(plans, 'Hasta')).toBe(day);
    expect(fact(plans, 'Motivo')).toBe('Cooperativa piloto');
    expect(fact(plans, 'Dada por')).toBe('Ana Ferreyra');
    const history = within(record).getByRole('table', { name: 'Historial de planes' });
    expect(within(history).getAllByRole('row')[1]).toHaveTextContent('Básico → Empresa');
    expect(within(history).getAllByRole('row')[1]).toHaveTextContent('Cortesía');

    expect(db.backoffice.records[22]?.courtesy).toMatchObject({
      plan: { code: 'empresa' },
      ends_at: ends.toISOString(),
      reason: 'Cooperativa piloto',
    });
    expect(db.backoffice.accounts.find((a) => a.id === 22)).toMatchObject({
      plan: { code: 'empresa' },
      status: 'trial',
    });
    expect(db.backoffice.actions[0]).toMatchObject({
      action: 'courtesy_grant',
      target_user: { id: 22 },
      payload: { plan: 'empresa', until, reason: 'Cooperativa piloto', from_plan: 'basico' },
    });
  });

  it('offers a founder only Empresa', async () => {
    const { user, record } = await openRecord(ANA, dbFor());

    const dialog = await openGrant(user, record);
    const plan = within(dialog).getByLabelText('Plan');
    expect(
      within(plan)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Empresa']);
    expect(dialog).toHaveTextContent('al vencer, a Productor');
  });
});

describe('Refusals (S5, S6)', () => {
  it('shows the API refusal inside the dialog and records nothing', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(JUAN, db);

    const dialog = await openGrant(user, record);
    fillGrant(dialog, daysAhead(30), 'Cliente grande');
    await user.click(within(dialog).getByRole('button', { name: 'Dar cortesía' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'La cuenta tiene una suscripción paga: cancelala primero.',
    );
    expect(dialog).toHaveAttribute('open');
    expect(db.backoffice.records[21]?.courtesy ?? null).toBeNull();
    expect(db.backoffice.actions.some((a) => a.action === 'courtesy_grant')).toBe(false);
  });

  it('shows a date past one year next to the field', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(MARTA, db);

    const dialog = await openGrant(user, record);
    fillGrant(dialog, daysAhead(400), 'Cliente grande');
    await user.click(within(dialog).getByRole('button', { name: 'Dar cortesía' }));

    const last = daysAhead(365).split('-').reverse().join('/');
    expect(
      await within(dialog).findByText(
        `La cortesía dura como máximo un año: elegí una fecha hasta el ${last}.`,
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(/^Hasta el día/)).toHaveAttribute('aria-invalid', 'true');
    expect(db.backoffice.records[22]?.courtesy ?? null).toBeNull();
  });

  it('refuses a cortesía past the cap of 20', async () => {
    const db = dbFor();
    for (let id = 300; id < 320; id += 1) {
      db.backoffice.records[id] = {
        plan_expires_at: null,
        is_active: true,
        plan_changes: [],
        lotes: [],
        alert_rules: [],
        courtesy: courtesyUntil(daysAhead(30)),
      };
    }
    const { user, record } = await openRecord(MARTA, db);

    const dialog = await openGrant(user, record);
    fillGrant(dialog, daysAhead(30), 'Cliente grande');
    await user.click(within(dialog).getByRole('button', { name: 'Dar cortesía' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ya hay 20 cortesías activas. Revocá alguna antes de dar otra.',
    );
  });

  it('asks for the date and the reason before sending anything', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(MARTA, db);

    const dialog = await openGrant(user, record);
    fireEvent.change(within(dialog).getByLabelText(/^Motivo/), { target: { value: '   ' } });
    await user.click(within(dialog).getByRole('button', { name: 'Dar cortesía' }));

    expect(within(dialog).getByText('Elegí una fecha.')).toBeVisible();
    expect(within(dialog).getByText('Escribí el motivo.')).toBeVisible();
    expect(within(dialog).getByLabelText(/^Motivo/)).toHaveAttribute('aria-invalid', 'true');
    expect(writes(db)).toEqual([]);
  });
});

describe('Revoke a cortesía (S5)', () => {
  it('shows the active cortesía and revokes it after confirming', async () => {
    const db = dbFor();
    withCourtesy(db);
    const { user, record } = await openRecord(MARTA, db);
    expect(fact(planSection(record), 'Motivo')).toBe('Cooperativa piloto');

    await user.click(within(record).getByRole('button', { name: 'Revocar cortesía' }));
    const dialog = screen.getByRole('dialog', { name: '¿Revocar la cortesía de Marta Ríos?' });
    expect(dialog).toHaveTextContent('Pasa a Básico ahora');
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Revocar cortesía' }));

    expect(await within(record).findByText('Revocamos la cortesía de Marta Ríos.')).toBeVisible();
    expect(writes(db)).toEqual([
      { method: 'DELETE', path: '/api/backoffice/cuentas/22/cortesia/', body: undefined },
    ]);
    const data = within(record).getByRole('region', { name: 'Datos' });
    expect(fact(data, 'Plan')).toBe('Básico');
    expect(fact(data, 'Estado')).toBe('Activa');
    expect(within(record).queryByRole('button', { name: 'Revocar cortesía' })).toBeNull();
    expect(db.backoffice.records[22]?.courtesy).toBeNull();
    expect(db.backoffice.actions[0]).toMatchObject({
      action: 'courtesy_revoke',
      payload: { plan: 'empresa', until: daysAhead(60), to_plan: 'basico' },
    });
  });

  it('sends nothing when the confirmation is cancelled', async () => {
    const db = dbFor();
    withCourtesy(db);
    const { user, record } = await openRecord(MARTA, db);

    await user.click(within(record).getByRole('button', { name: 'Revocar cortesía' }));
    const dialog = screen.getByRole('dialog', { name: '¿Revocar la cortesía de Marta Ríos?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(writes(db)).toEqual([]);
    expect(db.backoffice.records[22]?.courtesy).not.toBeNull();
  });
});

describe('The plan change only goes down (S5)', () => {
  it('offers only Básico to an account that is not a founder', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(JUAN, db);

    await user.click(within(record).getByRole('button', { name: 'Cambiar plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambiar el plan de Juan Gómez' });
    const plan = within(dialog).getByLabelText('Plan nuevo');
    expect(
      within(plan)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Básico']);
    expect(dialog).toHaveTextContent('Para dar un plan pago sin cobrar, usá una cortesía.');
  });

  it('offers Básico and Productor to a founder', async () => {
    const db = dbFor();
    const { user, record } = await openRecord(ANA, db);

    await user.click(within(record).getByRole('button', { name: 'Cambiar plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambiar el plan de Ana Ferreyra' });
    const plan = within(dialog).getByLabelText('Plan nuevo');
    expect(
      within(plan)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Básico', 'Productor']);
  });

  it('ends an active cortesía when moving down to Básico', async () => {
    const db = dbFor();
    withCourtesy(db);
    const { user, record } = await openRecord(MARTA, db);

    await user.click(within(record).getByRole('button', { name: 'Cambiar plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambiar el plan de Marta Ríos' });
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar plan' }));

    expect(await within(record).findByText('Marta Ríos pasó al plan Básico.')).toBeVisible();
    await waitFor(() =>
      expect(within(record).queryByRole('button', { name: 'Revocar cortesía' })).toBeNull(),
    );
    expect(db.backoffice.records[22]?.courtesy).toBeNull();
  });
});

describe('Registro labels for cortesías (S5)', () => {
  const person = { id: 22, name: 'Marta Ríos', email: 'marta@sancayetano.com.ar' };
  const cases: [BackofficeActionKind, ActionRow['payload'], string][] = [
    [
      'courtesy_grant',
      { plan: 'empresa', until: '2027-03-31', reason: 'Cooperativa piloto', from_plan: 'basico' },
      'Cortesía de Empresa hasta el 31 de marzo de 2027 (venía de Básico). ' +
        'Motivo: «Cooperativa piloto»',
    ],
    [
      'courtesy_revoke',
      { plan: 'empresa', until: '2027-03-31', to_plan: 'basico' },
      'Cortesía de Empresa revocada (era hasta el 31 de marzo de 2027): pasó a Básico',
    ],
  ];

  it('describes giving and revoking in words', async () => {
    const db = dbFor();
    db.backoffice.actions = cases.map(([action, payload], index) => ({
      id: 600 + index,
      action,
      actor: person,
      target_user: person,
      payload,
      at: '2026-11-20T12:00:00Z',
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

describe('The user sees the cortesía in the plan history (S3, S5)', () => {
  it('words a cortesía given and ended', async () => {
    const history: PlanChange[] = [
      {
        at: '2027-02-01T03:00:00Z',
        from_plan: { code: 'empresa', name: 'Empresa' },
        to_plan: { code: 'basico', name: 'Básico' },
        reason: 'courtesy_ended',
      },
      {
        at: '2026-11-20T15:00:00Z',
        from_plan: { code: 'basico', name: 'Básico' },
        to_plan: { code: 'empresa', name: 'Empresa' },
        reason: 'courtesy',
      },
    ];
    renderApp('/perfil/suscripcion', createMockDb({ user: demoUser, planHistory: history }));

    const list = await screen.findByRole('list', { name: 'Cambios de plan' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.timeline-title')?.textContent)).toEqual([
      'Terminó tu cortesía',
      'Empezó tu cortesía',
    ]);
    expect(within(items[0]!).getByText('Empresa → Básico')).toBeInTheDocument();
  });
});
