import { useState, type FormEvent } from 'react';
import { changeAccountPlan, type AccountRow } from '../../../api/backoffice';
import type { PlanCode } from '../../../api/types';
import { FormAlert, SelectField, TextField } from '../../../components/Field';
import { PLAN_NAMES } from '../format';
import { useBackofficeMutation } from '../queries';

/** Why a paying account has no "Cambiar plan" (cortesias L8): the words of the API's refusal. */
export const PAYING_PLAN =
  'La cuenta paga una suscripción: para bajarla, cancelá la suscripción desde su ficha (sigue con el plan hasta el fin del mes pagado); para subirla, la persona se suscribe al otro plan.';

/**
 * `POST cuentas/{id}/plan/`: the same change_plan as the Django admin, logged with the note. It
 * only moves down to the free plan, Básico, or Productor for a founder (cortesias S4, S5): a
 * paid plan for free is a cortesía, with an end date.
 */
export function ChangePlanForm({
  account,
  onDone,
  onCancel,
}: {
  account: Pick<AccountRow, 'id' | 'name' | 'plan' | 'founder_number'>;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const plans: PlanCode[] = account.founder_number === null ? ['basico'] : ['basico', 'productor'];
  const [plan, setPlan] = useState<PlanCode>(
    plans.find((code) => code === account.plan.code) ?? 'basico',
  );
  const [note, setNote] = useState('');
  const change = useBackofficeMutation((input: { plan: PlanCode; note: string }) =>
    changeAccountPlan(account.id, input.plan, input.note),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    change.mutate(
      { plan, note: note.trim() },
      { onSuccess: (row) => onDone(`${row.name} pasó al plan ${row.plan.name}.`) },
    );
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="fine">
        Ahora está en {account.plan.name}. El cambio queda en el registro y en su historial de
        planes, y termina una prueba o una cortesía.
      </p>
      <SelectField
        label="Plan nuevo"
        name="plan"
        value={plan}
        hint="Para dar un plan pago sin cobrar, usá una cortesía."
        onChange={(e) => {
          change.reset();
          setPlan(e.target.value as PlanCode);
        }}
      >
        {plans.map((code) => (
          <option key={code} value={code}>
            {PLAN_NAMES[code]}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Nota (opcional)"
        name="note"
        maxLength={200}
        hint="Por qué se cambia, para el registro. Hasta 200 caracteres."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <FormAlert message={change.error?.message} />
      <div className="bo-dialog-actions">
        <button type="submit" className="btn btn--primary" disabled={change.isPending}>
          {change.isPending ? 'Cambiando…' : 'Cambiar plan'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
