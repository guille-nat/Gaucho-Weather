import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { User } from '../api/types';
import { demoLotes, demoUser } from '../mocks/fixtures';
import { reportsOf } from '../mocks/backofficeReports';
import { createMockDb, type MockDb } from '../mocks/handlers';
import { renderApp } from './renderApp';

/** The Informes tab of the backoffice (backoffice-superadmin S5-S8). */

const admin: User = { ...demoUser, is_superuser: true };

const dbFor = (user: User | null) => createMockDb({ user, lotes: demoLotes().slice(0, 1) });

const reportCalls = (db: MockDb) =>
  db.sent
    .filter((r) => r.path.startsWith('/api/backoffice/informes/'))
    .map((r) => r.path)
    .sort();

const rowOf = (table: HTMLElement, month: string) => {
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByRole('rowheader', { name: month }));
  if (!row) throw new Error(`No row for ${month}`);
  return row;
};

async function openInformes() {
  const db = dbFor(admin);
  const view = renderApp('/backoffice?seccion=informes', db);
  const panel = await screen.findByRole('tabpanel', { name: 'Informes' });
  return { ...view, db, panel };
}

describe('Informes tab', () => {
  it('shows revenue per month and the monthly recurring revenue (S5)', async () => {
    const { panel, db } = await openInformes();

    const section = await within(panel).findByRole('region', { name: 'Ingresos' });
    expect(within(section).getByText('Ingreso mensual recurrente').nextSibling).toHaveTextContent(
      '$ 64.800',
    );
    const table = await within(section).findByRole('table', { name: 'Ingresos por mes' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Mes', 'Cobrado', 'Pagos aprobados', 'Pagos rechazados', 'Altas', 'Bajas']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toHaveTextContent('dic 2025');
    expect(rowOf(table, 'nov 2026')).toHaveTextContent('$ 94.600');
    expect(
      within(rowOf(table, 'oct 2026'))
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['$ 79.700', '3', '1', '1', '0']);
    // The bar of the biggest month fills its track; the bars are decoration only.
    const bar = rowOf(table, 'nov 2026').querySelector('.bo-bar');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar).toHaveStyle({ '--share': '100' });
    expect(reportCalls(db)).toEqual([
      '/api/backoffice/informes/ingresos/',
      '/api/backoffice/informes/uso/',
      '/api/backoffice/informes/usuarios/',
    ]);
  });

  it('shows sign-ups, accounts per plan, trial conversion and founders (S6)', async () => {
    const { panel } = await openInformes();

    const section = await within(panel).findByRole('region', { name: 'Usuarios' });
    const signUps = await within(section).findByRole('table', { name: 'Altas por mes' });
    expect(rowOf(signUps, 'oct 2026')).toHaveTextContent('13');
    const byPlan = within(section).getByRole('table', { name: 'Cuentas por plan' });
    expect(
      within(byPlan)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Plan', 'Founder', 'En prueba', 'Activa', 'Total']);
    const productor = within(byPlan).getByRole('rowheader', { name: 'Productor' }).closest('tr')!;
    expect(
      within(productor)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['12', '4', '3', '19']);
    const fact = (label: string) => within(section).getByText(label).nextSibling;
    expect(fact('Cuentas que probaron Productor')).toHaveTextContent('9');
    expect(fact('Pasaron a pago después')).toHaveTextContent('3');
    expect(fact('Conversión')).toHaveTextContent('33,3 %');
    expect(fact('Founders usados')).toHaveTextContent('12 de 100');
    expect(fact('Lugares de founder libres')).toHaveTextContent('88');
  });

  it('shows a dash for the conversion when nobody tried a plan yet', async () => {
    const db = dbFor(admin);
    reportsOf(db).users.conversion = { pruebas: 0, pagaron: 0, porcentaje: null };
    renderApp('/backoffice?seccion=informes', db);

    const section = await screen.findByRole('region', { name: 'Usuarios' });
    expect(await within(section).findByText('Conversión')).toBeInTheDocument();
    expect(within(section).getByText('Conversión').nextSibling).toHaveTextContent('—');
  });

  it('shows lotes per month, active alerts and active users (S7)', async () => {
    const { panel } = await openInformes();

    const section = await within(panel).findByRole('region', { name: 'Uso' });
    const table = await within(section).findByRole('table', { name: 'Lotes creados por mes' });
    expect(rowOf(table, 'oct 2026')).toHaveTextContent('15');
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(12);
    const fact = (label: string) => within(section).getByText(label).nextSibling;
    expect(fact('Lotes en total')).toHaveTextContent('47');
    expect(fact('Alertas activas')).toHaveTextContent('18');
    expect(fact('Usuarios activos en los últimos 30 días')).toHaveTextContent('26');
  });

  it('links the three CSV downloads (S8)', async () => {
    const { panel } = await openInformes();

    const section = within(panel).getByRole('region', { name: 'Descargas' });
    const links = within(section).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Cuentas (CSV)', '/api/backoffice/informes/exportar/cuentas.csv'],
      ['Pagos (CSV)', '/api/backoffice/informes/exportar/pagos.csv'],
      ['Registro (CSV)', '/api/backoffice/informes/exportar/registro.csv'],
    ]);
    for (const link of links) expect(link).toHaveAttribute('download');
    expect(within(section).getByText(/Cada descarga queda anotada en el Registro/)).toBeVisible();
  });

  it('leaves for Perfil, keeping the session, when the account is no longer a super admin', async () => {
    const db = dbFor(admin);
    const { user } = renderApp('/backoffice', db);
    await screen.findByRole('tabpanel', { name: 'Resumen' });

    // Demoted elsewhere: the reports answer 403.
    db.user = { ...admin, is_superuser: false };
    const tabs = screen.getByRole('tablist', { name: 'Secciones del backoffice' });
    await user.click(within(tabs).getByRole('tab', { name: 'Informes' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ingresar' })).toBeNull();
    expect(reportCalls(db).length).toBeGreaterThan(0);
  });
});
