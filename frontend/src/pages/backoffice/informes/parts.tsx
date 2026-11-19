import { useId, type CSSProperties, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { LoadFailed, Loading } from '../../../components/backoffice/Loading';
import { formatCount } from '../format';
import { monthLabel } from './month';

/** Building blocks of the Informes tab (backoffice-superadmin S5-S8). */

export type Fact = [label: string, value: string];

export function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className="bo-facts">
      {facts.map(([label, value]) => (
        <div key={label} className="bo-fact">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One report: a titled region that shows its data, its skeleton or its error. */
export function ReportSection<T>({
  title,
  what,
  query,
  children,
}: {
  title: string;
  what: string;
  query: UseQueryResult<T, Error>;
  children: (data: T) => ReactNode;
}) {
  const id = useId();
  let body: ReactNode;
  if (query.data) body = children(query.data);
  else if (query.isError)
    body = <LoadFailed error={query.error} onRetry={() => void query.refetch()} />;
  else body = <Loading what={what} />;
  return (
    <section className="panel bo-report" aria-labelledby={id}>
      <h2 className="panel-title" id={id}>
        {title}
      </h2>
      {body}
    </section>
  );
}

export interface MonthColumn<T> {
  label: string;
  value: (row: T) => number;
  format?: (value: number) => string;
}

/**
 * The 12 months, oldest first, as a table. The first column also draws a plain CSS bar under
 * the month, scaled to the biggest month; the figure itself is always in its cell, so the bar is
 * hidden from assistive technology.
 */
export function MonthTable<T extends { mes: string }>({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: T[];
  columns: MonthColumn<T>[];
}) {
  const [main] = columns;
  const max = main ? Math.max(0, ...rows.map(main.value)) : 0;
  return (
    <div className="bo-table-wrap bo-report-table" role="region" aria-label={title} tabIndex={0}>
      <table className="bo-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            {columns.map((column) => (
              <th key={column.label} scope="col" className="bo-num">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const share = main && max > 0 ? Math.round((main.value(row) / max) * 100) : 0;
            return (
              <tr key={row.mes}>
                <th scope="row" className="bo-month">
                  {monthLabel(row.mes)}
                  <span
                    className="bo-bar"
                    aria-hidden="true"
                    style={{ '--share': share } as CSSProperties}
                  />
                </th>
                {columns.map((column) => (
                  <td key={column.label} data-label={column.label} className="bo-num">
                    {(column.format ?? formatCount)(column.value(row))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
