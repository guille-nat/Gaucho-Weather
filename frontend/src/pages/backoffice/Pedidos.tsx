import { useState, type FormEvent } from 'react';
import { applyRequest, listRequests, rejectRequest, type RequestRow } from '../../api/backoffice';
import { BackofficeDialog } from '../../components/backoffice/BackofficeDialog';
import { LoadFailed, Loading } from '../../components/backoffice/Loading';
import { Pager } from '../../components/backoffice/Pager';
import { FormAlert, TextField } from '../../components/Field';
import { queryKeys } from '../../query/keys';
import { Saved } from '../Perfil';
import { formatDay, MEMBERSHIP_WORDS } from './format';
import { useBackofficeMutation, useBackofficeQuery } from './queries';

/** "Pasar a Empresa", "Baja a Básico": what the account asked for. */
const asked = (row: RequestRow) =>
  row.kind === 'cancel' ? `Baja a ${row.plan.name}` : `Pasar a ${row.plan.name}`;

function RejectForm({
  request,
  onDone,
  onCancel,
}: {
  request: RequestRow;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const reject = useBackofficeMutation((text: string) => rejectRequest(request.id, text));

  function submit(event: FormEvent) {
    event.preventDefault();
    reject.mutate(note.trim(), {
      onSuccess: () => onDone(`Rechazamos el pedido de ${request.user.name}.`),
    });
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="fine">{asked(request)}. El plan no cambia y no le mandamos email.</p>
      <TextField
        label="Nota (opcional)"
        name="note"
        maxLength={200}
        hint="Queda solo en el registro del backoffice."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <FormAlert message={reject.error?.message} />
      <div className="bo-dialog-actions">
        <button type="submit" className="btn btn--danger-solid" disabled={reject.isPending}>
          {reject.isPending ? 'Rechazando…' : 'Rechazar pedido'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Pending plan requests, oldest first: the queue to work through (S4). */
export function Pedidos() {
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<RequestRow | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const requests = useBackofficeQuery(queryKeys.backofficeList('pedidos', { page }), () =>
    listRequests(page),
  );
  const apply = useBackofficeMutation((row: RequestRow) => applyRequest(row.id));

  /** A resolved request leaves the queue: if it was the last row of a later page, that page
   * no longer exists (the API answers 404), so step back before the list is read again. */
  function resolved(message: string) {
    setSaved(message);
    if (page > 1 && requests.data?.results.length === 1) setPage(page - 1);
  }

  return (
    <div className="bo-tab">
      <p className="fine">
        Aplicar cambia el plan y le manda el email «Tu plan ahora es…», igual que el admin.
      </p>
      <FormAlert message={apply.error?.message} />
      <Saved message={saved} />
      {requests.data ? (
        requests.data.results.length ? (
          <>
            <div
              className="bo-table-wrap"
              role="region"
              aria-label="Pedidos pendientes"
              tabIndex={0}
            >
              <table className="bo-table">
                <caption className="sr-only">Pedidos pendientes</caption>
                <thead>
                  <tr>
                    <th scope="col">Cuenta</th>
                    <th scope="col">Pide</th>
                    <th scope="col">Plan actual</th>
                    <th scope="col">Pedido el</th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.data.results.map((row) => {
                    const busy = apply.isPending && apply.variables?.id === row.id;
                    return (
                      <tr key={row.id}>
                        <th scope="row" data-label="Cuenta">
                          <span className="bo-person">
                            <span className="bo-person-name">{row.user.name}</span>
                            <span className="bo-person-email">{row.user.email}</span>
                          </span>
                        </th>
                        <td data-label="Pide" className="bo-strong">
                          {asked(row)}
                        </td>
                        <td data-label="Plan actual">
                          {row.user.plan.name} · {MEMBERSHIP_WORDS[row.user.status]}
                        </td>
                        <td data-label="Pedido el">{formatDay(row.created_at)}</td>
                        <td className="bo-actions">
                          <button
                            type="button"
                            className="btn btn--primary bo-row-btn"
                            disabled={apply.isPending}
                            onClick={() => {
                              setSaved(null);
                              apply.mutate(row, {
                                onSuccess: () =>
                                  resolved(`Aplicamos el pedido de ${row.user.name}.`),
                              });
                            }}
                          >
                            {busy ? 'Aplicando…' : 'Aplicar'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger bo-row-btn"
                            disabled={apply.isPending}
                            onClick={() => {
                              setSaved(null);
                              apply.reset();
                              setRejecting(row);
                            }}
                          >
                            Rechazar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} count={requests.data.count} onPage={setPage} />
          </>
        ) : (
          <p className="notice">No hay pedidos pendientes.</p>
        )
      ) : requests.isError ? (
        <LoadFailed error={requests.error} onRetry={() => void requests.refetch()} />
      ) : (
        <Loading what="los pedidos" />
      )}
      <BackofficeDialog
        open={rejecting !== null}
        title={rejecting ? `Rechazar el pedido de ${rejecting.user.name}` : 'Rechazar el pedido'}
        onClose={() => setRejecting(null)}
      >
        {rejecting ? (
          <RejectForm
            key={rejecting.id}
            request={rejecting}
            onCancel={() => setRejecting(null)}
            onDone={(message) => {
              setRejecting(null);
              resolved(message);
            }}
          />
        ) : null}
      </BackofficeDialog>
    </div>
  );
}
