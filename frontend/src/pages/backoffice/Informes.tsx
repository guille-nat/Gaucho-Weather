import { useId } from 'react';
import {
  exportUrl,
  getRevenueReport,
  getUsageReport,
  getUsersReport,
  type ExportFile,
  type UsersReport,
} from '../../api/backofficeReports';
import { formatMoney } from '../../api/payments';
import { DASH } from '../../lib/format';
import { queryKeys } from '../../query/keys';
import '../../styles/backoffice-informes.css';
import { formatCount } from './format';
import { Facts, MonthTable, ReportSection } from './informes/parts';
import { useBackofficeQuery } from './queries';

const percent = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

const conversionRate = ({ porcentaje }: UsersReport['conversion']) =>
  porcentaje === null ? DASH : `${percent.format(porcentaje)} %`;

function Revenue() {
  const query = useBackofficeQuery(
    queryKeys.backofficeList('informes', { report: 'ingresos' }),
    getRevenueReport,
  );
  return (
    <ReportSection title="Ingresos" what="los ingresos" query={query}>
      {(report) => (
        <>
          <Facts facts={[['Ingreso mensual recurrente', formatMoney(report.mrr_ars)]]} />
          <MonthTable
            title="Ingresos por mes"
            rows={report.meses}
            columns={[
              { label: 'Cobrado', value: (m) => m.cobrado_ars, format: (v) => formatMoney(v) },
              { label: 'Pagos aprobados', value: (m) => m.pagos_aprobados },
              { label: 'Pagos rechazados', value: (m) => m.pagos_rechazados },
              { label: 'Altas', value: (m) => m.altas },
              { label: 'Bajas', value: (m) => m.bajas },
            ]}
          />
          <p className="fine">
            Cobrado cuenta solo pesos, por el día del pago. Altas y bajas son suscripciones de
            Mercado Pago; una suscripción que nunca se pagó no es un alta.
          </p>
        </>
      )}
    </ReportSection>
  );
}

function PlanTable({ rows }: { rows: UsersReport['por_plan'] }) {
  const columns = [
    ['Founder', 'founder'],
    ['En prueba', 'trial'],
    ['Activa', 'active'],
    ['Total', 'total'],
  ] as const;
  return (
    <div className="bo-table-wrap" role="region" aria-label="Cuentas por plan" tabIndex={0}>
      <table className="bo-table">
        <caption className="sr-only">Cuentas por plan</caption>
        <thead>
          <tr>
            <th scope="col">Plan</th>
            {columns.map(([label]) => (
              <th key={label} scope="col" className="bo-num">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.plan.code}>
              <th scope="row" className="bo-strong">
                {row.plan.name}
              </th>
              {columns.map(([label, key]) => (
                <td key={key} data-label={label} className="bo-num">
                  {formatCount(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Users() {
  const query = useBackofficeQuery(
    queryKeys.backofficeList('informes', { report: 'usuarios' }),
    getUsersReport,
  );
  return (
    <ReportSection title="Usuarios" what="los usuarios" query={query}>
      {(report) => (
        <>
          <MonthTable
            title="Altas por mes"
            rows={report.meses}
            columns={[{ label: 'Altas', value: (m) => m.altas }]}
          />
          <PlanTable rows={report.por_plan} />
          <Facts
            facts={[
              ['Cuentas que probaron Productor', formatCount(report.conversion.pruebas)],
              ['Pasaron a pago después', formatCount(report.conversion.pagaron)],
              ['Conversión', conversionRate(report.conversion)],
              [
                'Founders usados',
                `${formatCount(report.founders.usados)} de ${formatCount(report.founders.cupo)}`,
              ],
              ['Lugares de founder libres', formatCount(report.founders.libres)],
            ]}
          />
        </>
      )}
    </ReportSection>
  );
}

function Usage() {
  const query = useBackofficeQuery(
    queryKeys.backofficeList('informes', { report: 'uso' }),
    getUsageReport,
  );
  return (
    <ReportSection title="Uso" what="el uso" query={query}>
      {(report) => (
        <>
          <Facts
            facts={[
              ['Lotes en total', formatCount(report.lotes_total)],
              ['Alertas activas', formatCount(report.alertas_activas)],
              [
                'Usuarios activos en los últimos 30 días',
                formatCount(report.usuarios_activos_30_dias),
              ],
            ]}
          />
          <MonthTable
            title="Lotes creados por mes"
            rows={report.meses}
            columns={[{ label: 'Lotes', value: (m) => m.lotes }]}
          />
        </>
      )}
    </ReportSection>
  );
}

const DOWNLOADS: [ExportFile, string][] = [
  ['cuentas', 'Cuentas'],
  ['pagos', 'Pagos'],
  ['registro', 'Registro'],
];

/** Plain links: the browser sends the session cookie on the GET and saves the file. */
function Downloads() {
  const id = useId();
  return (
    <section className="panel bo-report" aria-labelledby={id}>
      <h2 className="panel-title" id={id}>
        Descargas
      </h2>
      <ul className="bo-downloads" role="list">
        {DOWNLOADS.map(([file, label]) => (
          <li key={file}>
            <a className="btn btn--secondary" href={exportUrl(file)} download>
              {label} (CSV)
            </a>
          </li>
        ))}
      </ul>
      <p className="fine">
        Se abren con Excel o Google Sheets. Cada descarga queda anotada en el Registro.
      </p>
    </section>
  );
}

/**
 * Reports tab (backoffice-superadmin S5-S8): revenue, users and usage over the last 12 months in
 * Buenos Aires time, plus the CSV downloads. Each report has its own query, so one that fails
 * does not hide the others.
 */
export function Informes() {
  return (
    <div className="bo-tab bo-reports">
      <Revenue />
      <Users />
      <Usage />
      <Downloads />
    </div>
  );
}
