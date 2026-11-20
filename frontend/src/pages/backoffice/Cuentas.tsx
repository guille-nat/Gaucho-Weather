import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  listAccounts,
  type AccountFilters,
  type AccountRow,
  type MembershipStatus,
} from '../../api/backoffice';
import type { PlanCode } from '../../api/types';
import { BackofficeDialog } from '../../components/backoffice/BackofficeDialog';
import { LoadFailed, Loading } from '../../components/backoffice/Loading';
import { Pager } from '../../components/backoffice/Pager';
import { SelectField, TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { DASH } from '../../lib/format';
import { founderLabel } from '../../lib/membership';
import { queryKeys } from '../../query/keys';
import { Saved } from '../Perfil';
import { formatDay, MEMBERSHIP_WORDS, PLAN_NAMES, plural } from './format';
import { ChangePlanForm, PAYING_PLAN } from './cuenta/ChangePlanForm';
import { Ficha } from './cuenta/Ficha';
import { recordLink } from './cuenta/link';
import { useBackofficeQuery } from './queries';

const NO_FILTERS: AccountFilters = { q: '', plan: '', estado: '', page: 1 };
const PLAN_CODES = Object.keys(PLAN_NAMES) as PlanCode[];
const STATUSES = Object.keys(MEMBERSHIP_WORDS) as MembershipStatus[];

function statusOf(row: AccountRow) {
  return row.status === 'founder' && row.founder_number !== null
    ? founderLabel(row.founder_number)
    : MEMBERSHIP_WORDS[row.status];
}

function Filters({ onApply }: { onApply: (filters: AccountFilters) => void }) {
  const [draft, setDraft] = useState(NO_FILTERS);
  function submit(event: FormEvent) {
    event.preventDefault();
    onApply({ ...draft, page: 1 });
  }
  return (
    <form className="bo-filters" role="search" onSubmit={submit}>
      <TextField
        label="Buscar por nombre o email"
        type="search"
        name="q"
        autoComplete="off"
        spellCheck={false}
        value={draft.q}
        onChange={(e) => setDraft({ ...draft, q: e.target.value })}
      />
      <SelectField
        label="Plan"
        name="plan"
        value={draft.plan}
        onChange={(e) => setDraft({ ...draft, plan: e.target.value as PlanCode | '' })}
      >
        <option value="">Todos</option>
        {PLAN_CODES.map((code) => (
          <option key={code} value={code}>
            {PLAN_NAMES[code]}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Estado"
        name="estado"
        value={draft.estado}
        onChange={(e) => setDraft({ ...draft, estado: e.target.value as MembershipStatus | '' })}
      >
        <option value="">Todos</option>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {MEMBERSHIP_WORDS[status]}
          </option>
        ))}
      </SelectField>
      <button type="submit" className="btn btn--secondary">
        <Icon name="search" />
        Buscar
      </button>
    </form>
  );
}

/** Every account, newest first, with the filters of S4 and the plan change. */
function AccountList() {
  const [filters, setFilters] = useState(NO_FILTERS);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const accounts = useBackofficeQuery(queryKeys.backofficeList('cuentas', { ...filters }), () =>
    listAccounts(filters),
  );

  return (
    <div className="bo-tab">
      <Filters
        onApply={(next) => {
          setSaved(null);
          setFilters(next);
        }}
      />
      <Saved message={saved} />
      {accounts.data ? (
        <>
          <p className="bo-count" aria-live="polite">
            {plural(accounts.data.count, 'cuenta', 'cuentas')}
          </p>
          {accounts.data.results.length ? (
            <div className="bo-table-wrap" role="region" aria-label="Cuentas" tabIndex={0}>
              <table className="bo-table">
                <caption className="sr-only">Cuentas</caption>
                <thead>
                  <tr>
                    <th scope="col">Cuenta</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="bo-num">
                      Lotes
                    </th>
                    <th scope="col">Alta</th>
                    <th scope="col">Último ingreso</th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.data.results.map((row) => (
                    <tr key={row.id}>
                      <th scope="row" data-label="Cuenta">
                        <span className="bo-person">
                          <Link className="bo-person-name bo-person-link" to={recordLink(row.id)}>
                            {row.name}
                          </Link>
                          <span className="bo-person-email">{row.email}</span>
                        </span>
                        {row.is_superuser ? <span className="chip">Super admin</span> : null}
                      </th>
                      <td data-label="Plan">{row.plan.name}</td>
                      <td data-label="Estado">{statusOf(row)}</td>
                      <td data-label="Lotes" className="bo-num">
                        {row.lotes}
                      </td>
                      <td data-label="Alta">{formatDay(row.date_joined)}</td>
                      <td data-label="Último ingreso">
                        {row.last_login ? formatDay(row.last_login) : DASH}
                      </td>
                      <td className="bo-actions">
                        {row.paying ? (
                          <span className="fine">{PAYING_PLAN}</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--secondary bo-row-btn"
                            onClick={() => {
                              setSaved(null);
                              setEditing(row);
                            }}
                          >
                            Cambiar plan
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="notice">Ninguna cuenta coincide con la búsqueda.</p>
          )}
          <Pager
            page={filters.page}
            count={accounts.data.count}
            onPage={(page) => setFilters({ ...filters, page })}
          />
        </>
      ) : accounts.isError ? (
        <LoadFailed error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : (
        <Loading what="las cuentas" />
      )}
      <BackofficeDialog
        open={editing !== null}
        title={editing ? `Cambiar el plan de ${editing.name}` : 'Cambiar el plan'}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <ChangePlanForm
            key={editing.id}
            account={editing}
            onCancel={() => setEditing(null)}
            onDone={(message) => {
              setEditing(null);
              setSaved(message);
            }}
          />
        ) : null}
      </BackofficeDialog>
    </div>
  );
}

/**
 * The Cuentas tab: the list, or one account's record when the address names it
 * (`?cuenta=<id>`, backoffice-superadmin S1), so a reload or a shared link opens it again.
 */
export function Cuentas() {
  const [params] = useSearchParams();
  const id = Number(params.get('cuenta'));
  return Number.isInteger(id) && id > 0 ? <Ficha key={id} id={id} /> : <AccountList />;
}
