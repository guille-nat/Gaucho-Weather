import { getSummary, type BackofficeSummary } from '../../api/backoffice';
import { formatMoney } from '../../api/payments';
import type { PlanCode } from '../../api/types';
import { LoadFailed, Loading } from '../../components/backoffice/Loading';
import { queryKeys } from '../../query/keys';
import { formatCount, PLAN_NAMES } from './format';
import { useBackofficeQuery } from './queries';

type Fact = [label: string, value: string];

function Facts({ title, facts }: { title: string; facts: Fact[] }) {
  return (
    <section className="panel bo-summary-group" aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      <dl className="bo-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="bo-fact">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function groups(summary: BackofficeSummary): [string, Fact[]][] {
  const { accounts, payments } = summary;
  const active = (Object.keys(PLAN_NAMES) as PlanCode[]).map((code): Fact => [
    `Activas en ${PLAN_NAMES[code]}`,
    formatCount(accounts.active[code] ?? 0),
  ]);
  return [
    [
      'Cuentas',
      [
        ['Cuentas en total', formatCount(accounts.total)],
        ['Founders', formatCount(accounts.founders)],
        ['En prueba', formatCount(accounts.trial)],
        ...active,
        ['Altas en los últimos 30 días', formatCount(summary.new_accounts_last_30_days)],
      ],
    ],
    [
      'Pendiente',
      [
        ['Pedidos pendientes', formatCount(summary.pending_requests)],
        ['Lugares de founder libres', formatCount(summary.founders_left)],
      ],
    ],
    [
      'Ingresos en pesos',
      [
        ['Suscripciones activas', formatCount(payments.active_subscriptions)],
        ['Ingreso mensual', formatMoney(payments.monthly_ars)],
        ['Pagos de este mes', formatCount(payments.month_payments)],
        ['Cobrado este mes', formatMoney(payments.month_ars)],
      ],
    ],
  ];
}

/** Totals of accounts, requests and revenue (S4, S7): what needs a look first. */
export function Resumen() {
  const summary = useBackofficeQuery(queryKeys.backofficeList('resumen', {}), getSummary);
  if (summary.data) {
    return (
      <div className="bo-summary">
        {groups(summary.data).map(([title, facts]) => (
          <Facts key={title} title={title} facts={facts} />
        ))}
        <p className="fine bo-summary-note">
          Los ingresos cuentan solo pesos. El mes empieza el día 1 en hora de Buenos Aires.
        </p>
      </div>
    );
  }
  if (summary.isError) {
    return <LoadFailed error={summary.error} onRetry={() => void summary.refetch()} />;
  }
  return <Loading what="el resumen" />;
}
