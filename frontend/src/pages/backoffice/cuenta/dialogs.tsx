import { useState, type FormEvent, type ReactNode } from 'react';
import {
  getSummary,
  grantCourtesy,
  grantTrial,
  updateAccount,
  type AccountRecord,
  type CourtesyPlan,
} from '../../../api/backoffice';
import { ApiError } from '../../../api/client';
import { FormAlert, SelectField, TextField } from '../../../components/Field';
import { queryKeys } from '../../../query/keys';
import { formatDay, lastCourtesyDay, PLAN_NAMES, tomorrowInBuenosAires } from '../format';
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
        max={lastCourtesyDay()}
        required
        hint="Productor hasta el final de ese día, hora de Buenos Aires. Como máximo un año."
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

/** `YYYY-MM-DD` of an instant, in Buenos Aires (UTC−3 all year). */
const isoDayOf = (iso: string) =>
  new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * `POST cuentas/{id}/cortesia/` (cortesias S1, S5): a paid plan for free until the end of a day,
 * at most a year ahead, with a reason for the log. With an active cortesía it starts from it,
 * and what is sent replaces it. Every rule is the server's; the form only asks for what is
 * missing before sending.
 */
export function CourtesyForm({
  account,
  onDone,
  onCancel,
}: {
  account: AccountRecord;
  onDone: Done;
  onCancel: () => void;
}) {
  const active = account.courtesy;
  const founder = account.founder_number !== null;
  // A founder already has Productor for free: only Empresa is a gift.
  const plans: CourtesyPlan[] = founder ? ['empresa'] : ['productor', 'empresa'];
  const [plan, setPlan] = useState<CourtesyPlan>(
    plans.find((code) => code === active?.plan.code) ?? plans[0]!,
  );
  const [until, setUntil] = useState(active ? isoDayOf(active.ends_at) : '');
  const [reason, setReason] = useState(active?.reason ?? '');
  const [missing, setMissing] = useState({ until: false, reason: false });
  const grant = useBackofficeMutation(() =>
    grantCourtesy(account.id, { plan, hasta: until, motivo: reason.trim() }),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = { until: !until, reason: !reason.trim() };
    setMissing(next);
    if (next.until || next.reason) return;
    grant.mutate(undefined, { onSuccess: onDone });
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="fine">
        {active
          ? `Ya tiene ${active.plan.name} de cortesía hasta el ${formatDay(active.ends_at)}: lo que elijas reemplaza la de ahora.`
          : `Ahora está en ${account.plan.name}. Pasa al plan elegido sin pagar y, al vencer, a ${
              founder ? 'Productor' : 'Básico'
            }. Una semana antes le mandamos un mail para que se suscriba.`}
      </p>
      <SelectField
        label="Plan"
        name="plan"
        value={plan}
        error={fieldError(grant.error, 'plan')}
        onChange={(e) => {
          grant.reset();
          setPlan(e.target.value as CourtesyPlan);
        }}
      >
        {plans.map((code) => (
          <option key={code} value={code}>
            {PLAN_NAMES[code]}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Hasta el día"
        name="hasta"
        type="date"
        min={tomorrowInBuenosAires()}
        max={lastCourtesyDay()}
        required
        hint="Gratis hasta el final de ese día, hora de Buenos Aires. Como máximo, un año."
        value={until}
        error={missing.until ? 'Elegí una fecha.' : fieldError(grant.error, 'hasta')}
        onChange={(e) => {
          setMissing((m) => ({ ...m, until: false }));
          grant.reset();
          setUntil(e.target.value);
        }}
      />
      <TextField
        label="Motivo"
        name="motivo"
        autoComplete="off"
        maxLength={200}
        required
        hint="Por qué se la das, para el registro. Hasta 200 caracteres."
        value={reason}
        error={missing.reason ? 'Escribí el motivo.' : fieldError(grant.error, 'motivo')}
        onChange={(e) => {
          setMissing((m) => ({ ...m, reason: false }));
          grant.reset();
          setReason(e.target.value);
        }}
      />
      <FormAlert message={formError(grant.error, ['plan', 'hasta', 'motivo'])} />
      <div className="bo-dialog-actions">
        <button type="submit" className="btn btn--primary" disabled={grant.isPending}>
          {grant.isPending ? 'Dando la cortesía…' : 'Dar cortesía'}
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
