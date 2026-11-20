import type { MembershipStatus } from './backoffice';
import { BackofficeForbidden } from './backoffice';
import { ApiError, apiFetch, isCsrfFailure } from './client';
import type { PlanRef } from './types';

/**
 * The backoffice reports (backoffice-superadmin S5-S8). Field names follow
 * backend/apps/backoffice/reports.py. Months are `YYYY-MM` in Buenos Aires time: the last 12,
 * oldest first, with zeros for a month with nothing in it.
 */

export interface RevenueMonth {
  mes: string;
  /** Approved peso payments by the day they were paid. */
  cobrado_ars: number;
  pagos_aprobados: number;
  pagos_rechazados: number;
  /** Subscriptions created that month that got past "pending". */
  altas: number;
  /** Subscriptions cancelled or paused that month. */
  bajas: number;
}

export interface RevenueReport {
  meses: RevenueMonth[];
  /** What authorized peso subscriptions bill a month (the summary's "Ingreso mensual"). */
  mrr_ars: number;
}

export type PlanStatusCounts = Record<MembershipStatus, number>;

export interface UsersReport {
  meses: { mes: string; altas: number }[];
  por_plan: ({ plan: PlanRef; total: number } & PlanStatusCounts)[];
  conversion: { pruebas: number; pagaron: number; porcentaje: number | null };
  founders: { usados: number; cupo: number; libres: number };
}

export interface UsageReport {
  meses: { mes: string; lotes: number }[];
  lotes_total: number;
  alertas_activas: number;
  usuarios_activos_30_dias: number;
}

export type ExportFile = 'cuentas' | 'pagos' | 'registro';

const BASE = '/api/backoffice/informes/';

/** Same rule as the rest of the backoffice API: a non-CSRF 403 means "not a super admin". */
async function report<T>(path: string): Promise<T> {
  try {
    return await apiFetch<T>(`${BASE}${path}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && !isCsrfFailure(error)) {
      throw new BackofficeForbidden(error.message);
    }
    throw error;
  }
}

export const getRevenueReport = () => report<RevenueReport>('ingresos/');
export const getUsersReport = () => report<UsersReport>('usuarios/');
export const getUsageReport = () => report<UsageReport>('uso/');

/** A plain GET with the session cookie: the browser downloads it (Content-Disposition). */
export const exportUrl = (file: ExportFile) => `${BASE}exportar/${file}.csv`;
