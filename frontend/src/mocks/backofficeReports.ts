import type { HttpHandler } from 'msw';
import type { BackofficeHost, CsrfCheck } from './backoffice';

/**
 * In-memory backoffice reports API (backoffice-superadmin S5-S8), mirroring
 * backend/apps/backoffice/reports.py. Use `backofficeGate` from ./backoffice for the 403s.
 */
export function createReportHandlers(_db: BackofficeHost, _csrf: CsrfCheck): HttpHandler[] {
  return [];
}
