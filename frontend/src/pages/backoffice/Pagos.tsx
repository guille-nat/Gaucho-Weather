import { useState } from 'react';
import {
  listPayments,
  listSubscriptions,
  type PaymentsKind,
  type Person,
} from '../../api/backoffice';
import { formatMoney } from '../../api/payments';
import { LoadFailed, Loading } from '../../components/backoffice/Loading';
import { Pager } from '../../components/backoffice/Pager';
import { DASH } from '../../lib/format';
import { queryKeys } from '../../query/keys';
import { PaymentStatusChip, SubscriptionStatusChip } from '../Suscripcion';
import { formatDay, plural } from './format';
import { useBackofficeQuery } from './queries';

const KINDS: { kind: PaymentsKind; label: string }[] = [
  { kind: 'pagos', label: 'Pagos' },
  { kind: 'suscripciones', label: 'Suscripciones' },
];

function PersonCell({ person }: { person: Person }) {
  return (
    <th scope="row" data-label="Cuenta">
      <span className="bo-person">
        <span className="bo-person-name">{person.name}</span>
        <span className="bo-person-email">{person.email}</span>
      </span>
    </th>
  );
}

/** `external_id` finds the row in the Mercado Pago panel. */
const External = ({ id }: { id: string }) => (
  <td data-label="ID en Mercado Pago" className="bo-mono">
    {id}
  </td>
);

function PaymentsTable() {
  const [page, setPage] = useState(1);
  const list = useBackofficeQuery(queryKeys.backofficeList('pagos', { page }), () =>
    listPayments(page),
  );
  if (!list.data) {
    return list.isError ? (
      <LoadFailed error={list.error} onRetry={() => void list.refetch()} />
    ) : (
      <Loading what="los pagos" />
    );
  }
  if (!list.data.results.length) return <p className="notice">Todavía no hay pagos.</p>;
  return (
    <>
      <p className="bo-count">{plural(list.data.count, 'pago', 'pagos')}</p>
      <div className="bo-table-wrap" role="region" aria-label="Pagos" tabIndex={0}>
        <table className="bo-table">
          <caption className="sr-only">Pagos</caption>
          <thead>
            <tr>
              <th scope="col">Cuenta</th>
              <th scope="col">Fecha</th>
              <th scope="col" className="bo-num">
                Monto
              </th>
              <th scope="col">Estado</th>
              <th scope="col">ID en Mercado Pago</th>
            </tr>
          </thead>
          <tbody>
            {list.data.results.map((row) => (
              <tr key={row.id}>
                <PersonCell person={row.user} />
                <td data-label="Fecha">{formatDay(row.paid_at ?? row.created_at)}</td>
                <td data-label="Monto" className="bo-num">
                  {formatMoney(row.amount, row.currency)}
                </td>
                <td data-label="Estado">
                  <PaymentStatusChip status={row.status} />
                </td>
                <External id={row.external_id} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} count={list.data.count} onPage={setPage} />
    </>
  );
}

function SubscriptionsTable() {
  const [page, setPage] = useState(1);
  const list = useBackofficeQuery(queryKeys.backofficeList('suscripciones', { page }), () =>
    listSubscriptions(page),
  );
  if (!list.data) {
    return list.isError ? (
      <LoadFailed error={list.error} onRetry={() => void list.refetch()} />
    ) : (
      <Loading what="las suscripciones" />
    );
  }
  if (!list.data.results.length) {
    return <p className="notice">Todavía no hay suscripciones.</p>;
  }
  return (
    <>
      <p className="bo-count">{plural(list.data.count, 'suscripción', 'suscripciones')}</p>
      <div className="bo-table-wrap" role="region" aria-label="Suscripciones" tabIndex={0}>
        <table className="bo-table">
          <caption className="sr-only">Suscripciones</caption>
          <thead>
            <tr>
              <th scope="col">Cuenta</th>
              <th scope="col">Plan</th>
              <th scope="col" className="bo-num">
                Por mes
              </th>
              <th scope="col">Estado</th>
              <th scope="col">Próximo cobro o fin</th>
              <th scope="col">Alta</th>
              <th scope="col">ID en Mercado Pago</th>
            </tr>
          </thead>
          <tbody>
            {list.data.results.map((row) => (
              <tr key={row.id}>
                <PersonCell person={row.user} />
                <td data-label="Plan">{row.plan.name}</td>
                <td data-label="Por mes" className="bo-num">
                  {formatMoney(row.amount, row.currency)}
                </td>
                <td data-label="Estado">
                  <SubscriptionStatusChip status={row.status} />
                </td>
                <td data-label="Próximo cobro o fin">
                  {row.ends_at
                    ? `Termina el ${formatDay(row.ends_at)}`
                    : row.ended_at
                      ? `Terminó el ${formatDay(row.ended_at)}`
                      : row.next_payment_at
                        ? formatDay(row.next_payment_at)
                        : DASH}
                </td>
                <td data-label="Alta">{formatDay(row.created_at)}</td>
                <External id={row.external_id} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} count={list.data.count} onPage={setPage} />
    </>
  );
}

/** Mercado Pago payments and subscriptions, newest first (S7). */
export function Pagos() {
  const [kind, setKind] = useState<PaymentsKind>('pagos');
  return (
    <div className="bo-tab">
      <div className="segmented bo-kind" role="group" aria-label="Mostrar">
        {KINDS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className="segmented-option"
            aria-pressed={kind === option.kind}
            onClick={() => setKind(option.kind)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {kind === 'pagos' ? <PaymentsTable /> : <SubscriptionsTable />}
    </div>
  );
}
