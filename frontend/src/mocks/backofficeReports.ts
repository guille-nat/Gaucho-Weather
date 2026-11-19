import { http, HttpResponse, type HttpHandler } from 'msw';
import type { BackofficeActionKind } from '../api/backoffice';
import type { RevenueReport, UsageReport, UsersReport } from '../api/backofficeReports';
import { backofficeGate, type BackofficeHost, type CsrfCheck } from './backoffice';

/**
 * In-memory backoffice reports API (backoffice-superadmin S5-S8), mirroring
 * backend/apps/backoffice/reports.py. Every route goes through `backofficeGate` (403 for anyone
 * but a super admin, and the request is recorded in `db.sent`).
 */
export interface ReportsDb {
  revenue: RevenueReport;
  users: UsersReport;
  usage: UsageReport;
}

/** December 2025 to November 2026, oldest first, like the API on 2026-11-19. */
const MONTHS = [
  '2025-12',
  ...Array.from({ length: 11 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
];

export function demoReports(): ReportsDb {
  const cashed = [0, 0, 0, 0, 0, 0, 0, 0, 14900, 29800, 79700, 94600];
  return {
    revenue: {
      meses: MONTHS.map((mes, i) => ({
        mes,
        cobrado_ars: cashed[i] ?? 0,
        pagos_aprobados: (cashed[i] ?? 0) > 0 ? i - 7 : 0,
        pagos_rechazados: i === 10 ? 1 : 0,
        altas: i >= 8 ? 1 : 0,
        bajas: i === 11 ? 1 : 0,
      })),
      mrr_ars: 64800,
    },
    users: {
      meses: MONTHS.map((mes, i) => ({
        mes,
        altas: [0, 0, 1, 0, 2, 0, 0, 3, 5, 8, 13, 6][i] ?? 0,
      })),
      por_plan: [
        { plan: { code: 'basico', name: 'Básico' }, founder: 0, trial: 0, active: 21, total: 21 },
        {
          plan: { code: 'productor', name: 'Productor' },
          founder: 12,
          trial: 4,
          active: 3,
          total: 19,
        },
        { plan: { code: 'empresa', name: 'Empresa' }, founder: 0, trial: 0, active: 1, total: 1 },
      ],
      conversion: { pruebas: 9, pagaron: 3, porcentaje: 33.3 },
      founders: { usados: 12, cupo: 100, libres: 88 },
    },
    usage: {
      meses: MONTHS.map((mes, i) => ({
        mes,
        lotes: [0, 0, 2, 0, 3, 1, 0, 4, 6, 9, 15, 7][i] ?? 0,
      })),
      lotes_total: 47,
      alertas_activas: 18,
      usuarios_activos_30_dias: 26,
    },
  };
}

/** The reports of each mock database; tests change them through `reportsOf(db)`. */
const reports = new WeakMap<BackofficeHost, ReportsDb>();

export function reportsOf(db: BackofficeHost): ReportsDb {
  let data = reports.get(db);
  if (!data) {
    data = demoReports();
    reports.set(db, data);
  }
  return data;
}

const EXPORT_HEADERS: Record<string, string> = {
  cuentas:
    'ID,Nombre,Email,Plan,Estado,Founder n.º,Vence la prueba,Activa,Super admin,Alta,Último ingreso,Lotes',
  pagos:
    'ID,Cuenta,Email,Pasarela,ID en la pasarela,Suscripción,Monto,Moneda,Estado,Pagado el,Registrado',
  registro: 'ID,Fecha,Hecho por,Email,Acción,Cuenta,Email de la cuenta,Datos',
};

export function createReportHandlers(db: BackofficeHost, csrf: CsrfCheck): HttpHandler[] {
  const gate = backofficeGate(db, csrf);
  return [
    http.get('*/api/backoffice/informes/ingresos/', async ({ request }) => {
      return (await gate(request)) ?? HttpResponse.json(reportsOf(db).revenue);
    }),

    http.get('*/api/backoffice/informes/usuarios/', async ({ request }) => {
      return (await gate(request)) ?? HttpResponse.json(reportsOf(db).users);
    }),

    http.get('*/api/backoffice/informes/uso/', async ({ request }) => {
      return (await gate(request)) ?? HttpResponse.json(reportsOf(db).usage);
    }),

    // Header-only files: enough to try the links against the mock.
    http.get('*/api/backoffice/informes/exportar/:file', async ({ request, params }) => {
      const refused = await gate(request);
      if (refused) return refused;
      const name = String(params.file).replace(/\.csv$/, '');
      const header = EXPORT_HEADERS[name];
      if (!header) return HttpResponse.json({ detail: 'No encontrado.' }, { status: 404 });
      db.backoffice.actions.unshift({
        id: db.nextId++,
        // 'export' is one of the action types since migration 0002.
        action: 'export' as BackofficeActionKind,
        actor: { id: db.user!.id, name: db.user!.name, email: db.user!.email },
        target_user: null,
        payload: { file: `${name}.csv`, rows: 0 },
        at: new Date().toISOString(),
      });
      return new HttpResponse(`\ufeff${header}\r\n`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name}.csv"`,
        },
      });
    }),
  ];
}
