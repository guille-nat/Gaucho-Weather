import { useState, type FormEvent, type ReactNode } from 'react';
import { getSummary, grantTrial, updateAccount, type AccountRecord } from '../../../api/backoffice';
import { ApiError } from '../../../api/client';
import { FormAlert, TextField } from '../../../components/Field';
import { queryKeys } from '../../../query/keys';
import { tomorrowInBuenosAires } from '../format';
import { useBackofficeMutation, useBackofficeQuery } from '../queries';

type Done = (record: AccountRecord) => void;

const fieldError = (error: Error | null, field: string) =>
  error instanceof ApiError ? error.fieldErrors[field]?.[0] : undefined;

/** The message for the whole form, unless it is only about the fields shown. */
const formError = (error: Error | null, fields: string[]) =>
  error instanceof ApiError && fields.some((field) => error.fieldErrors[field])
    ? undefined
    : error?.message;

/**
 * One write behind a confirmation: what it does in words, the action, and the safe way out,
 * which has the focus when the dialog opens (modern-web-guidance `dialog`). A refusal stays in
 * the dialog, in the API's words.
 */
export function ConfirmAction<T = AccountRecord>({
  description,
  confirmLabel,
  pendingLabel,
  dismissLabel = 'Cancelar',
  danger = false,
  run,
  onDone,
  onCancel,
}: {
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  dismissLabel?: string;
  danger?: boolean;
  run: () => Promise<T>;
  onDone: (result: T) => void;
  onCancel: () => void;
}) {
  const action = useBackofficeMutation(run);
  return (
    <div className="form">
      <div className="bo-confirm-text">{description}</div>
      <FormAlert message={action.error?.message} />
      <div className="bo-dialog-actions">
        <button
          type="button"
          className={danger ? 'btn btn--danger' : 'btn btn--primary'}
          disabled={action.isPending}
          onClick={() => action.mutate(undefined, { onSuccess: onDone })}
        >
          {action.isPending ? pendingLabel : confirmLabel}
        </button>
        <button type="button" className="btn btn--secondary" data-autofocus onClick={onCancel}>
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}

/** `PATCH cuentas/{id}/`: an email another account has comes back next to the field. */
export function EditForm({
  account,
  onDone,
  onCancel,
}: {
  account: AccountRecord;
  onDone: Done;
  onCancel: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const save = useBackofficeMutation(() =>
    updateAccount(account.id, { name: name.trim(), email: email.trim() }),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(undefined, { onSuccess: onDone });
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="fine">El cambio queda en el registro con los datos de antes y los nuevos.</p>
      <TextField
        label="Nombre"
        name="name"
        autoComplete="off"
        maxLength={150}
        required
        value={name}
        error={fieldError(save.error, 'name')}
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="off"
        spellCheck={false}
        maxLength={254}
        required
        value={email}
        error={fieldError(save.error, 'email')}
        onChange={(e) => setEmail(e.target.value)}
      />
      <FormAlert message={formError(save.error, ['name', 'email'])} />
      <div className="bo-dialog-actions">
        <button type="submit" className="btn btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** `POST cuentas/{id}/prueba/`: Productor until the end of the chosen day (S3). */
export function TrialForm({
  account,
  onDone,
  onCancel,
}: {
  account: AccountRecord;
  onDone: Done;
  onCancel: () => void;
}) {
  const [until, setUntil] = useState('');
  const [missing, setMissing] = useState(false);
  const grant = useBackofficeMutation(() => grantTrial(account.id, until));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!until) {
      setMissing(true);
      return;
    }
    grant.mutate(undefined, { onSuccess: onDone });
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="fine">
        {account.status === 'trial'
          ? 'Ya está en prueba: la fecha nueva reemplaza la de ahora.'
          : `Ahora está en ${account.plan.name}. Pasa a Productor y, al vencer, a Básico.`}
      </p>
      <TextField
        label="Hasta el día"
        name="hasta"
        type="date"
        min={tomorrowInBuenosAires()}
        required
        hint="Productor hasta el final de ese día, hora de Buenos Aires."
        value={until}
        error={missing ? 'Elegí una fecha.' : fieldError(grant.error, 'hasta')}
        onChange={(e) => {
          setMissing(false);
          grant.reset();
          setUntil(e.target.value);
        }}
      />
      <FormAlert message={formError(grant.error, ['hasta'])} />
      <div className="bo-dialog-actions">
        <button type="submit" className="btn btn--primary" disabled={grant.isPending}>
          {grant.isPending ? 'Dando la prueba…' : 'Dar prueba'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

const quota = (left: number) =>
  left === 1 ? 'Queda 1 lugar de founder' : `Quedan ${left} lugares de founder`;

/** The founders left, from the summary: (A) the quota informs, it does not stop the grant. */
export function FounderQuota() {
  const summary = useBackofficeQuery(queryKeys.backofficeList('resumen', {}), getSummary);
  if (!summary.data) return <p className="fine">Contando los lugares de founder…</p>;
  const left = summary.data.founders_left;
  return (
    <p className="fine">
      {quota(left)}
      {left === 0 ? ': el cupo está completo, pero podés marcarla igual.' : '.'}
    </p>
  );
}
