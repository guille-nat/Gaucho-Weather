import { useState, type FormEvent } from 'react';
import {
  cancelPriceChange,
  listPrices,
  schedulePriceChange,
  updatePrice,
  type PendingPriceChange,
  type PlanPrice,
  type PriceInput,
} from '../../api/backoffice';
import { formatMoney } from '../../api/payments';
import { BackofficeDialog } from '../../components/backoffice/BackofficeDialog';
import { LoadFailed, Loading } from '../../components/backoffice/Loading';
import { FormAlert, TextField } from '../../components/Field';
import { formatDate } from '../../lib/format';
import { fieldError, formError } from '../../lib/formErrors';
import { queryKeys } from '../../query/keys';
import { Saved } from '../Perfil';
import { ConfirmAction } from './cuenta/dialogs';
import { tomorrowInBuenosAires } from './format';
import { useBackofficeMutation, useBackofficeQuery } from './queries';

const NOT_A_WHOLE_NUMBER = 'Usá un número entero, sin puntos ni comas.';
type Field = keyof PriceInput;

const asText = (value: number | null) => (value === null ? '' : String(value));

/** "" is null ("Precio a confirmar"); a whole number of 0 or more is the price; else an error. */
function parsePrice(text: string): number | null | undefined {
  const value = text.trim();
  if (value === '') return null;
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

const NOT_A_PRICE = 'Usá un número entero mayor que 0, sin puntos ni comas.';
const NOTICE_DAYS = 30;

/** The first day a change can take effect: 30 days after today in Buenos Aires (S1). */
const earliestChangeDay = (now = Date.now()) =>
  tomorrowInBuenosAires(now + (NOTICE_DAYS - 1) * 86_400_000);

const subscriptions = (n: number) => (n === 1 ? '1 suscripción' : `${n} suscripciones`);

/** `POST precios/{code}/cambio/`: the dialog is the confirmation, it says what goes out. */
function ScheduleForm({
  price,
  onDone,
  onCancel,
}: {
  price: PlanPrice;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState<Record<Field, string>>({
    price_ars_month: '',
    price_usd_month: '',
  });
  const [day, setDay] = useState('');
  const [invalid, setInvalid] = useState<Partial<Record<Field | 'day', string>>>({});
  const schedule = useBackofficeMutation((input: Parameters<typeof schedulePriceChange>[1]) =>
    schedulePriceChange(price.code, input),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    // Both prices, parsed like the immediate edit, and both required here (avisos-cambios L8).
    const whole = (field: Field) => {
      const value = parsePrice(text[field]);
      return typeof value === 'number' && value > 0 ? value : null;
    };
    const ars = whole('price_ars_month');
    const usd = whole('price_usd_month');
    const errors = {
      price_ars_month: ars ? undefined : NOT_A_PRICE,
      price_usd_month: usd ? undefined : NOT_A_PRICE,
      day: day ? undefined : 'Elegí una fecha.',
    };
    setInvalid(errors);
    if (!ars || !usd || !day) return;
    schedule.mutate(
      { price_ars_month: ars, price_usd_month: usd, effective_on: day },
      { onSuccess: onDone },
    );
  }

  const priceField = (field: Field, label: string) => (
    <TextField
      label={label}
      name={field}
      inputMode="numeric"
      autoComplete="off"
      value={text[field]}
      error={invalid[field] ?? fieldError(schedule.error, field)}
      onChange={(e) => {
        schedule.reset();
        setInvalid({ ...invalid, [field]: undefined });
        setText({ ...text, [field]: e.target.value });
      }}
    />
  );

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="fine">
        Les manda un email ahora a las suscripciones de {price.name} cuyo monto cambia. Cada una
        paga el precio nuevo desde su primer cobro 30 días después del email, y los checkouts nuevos
        desde la fecha que elijas.
      </p>
      {priceField('price_ars_month', 'Pesos por mes, nuevo')}
      {priceField('price_usd_month', 'Dólares por mes, nuevo')}
      <TextField
        label="Rige desde"
        name="effective_on"
        type="date"
        min={earliestChangeDay()}
        required
        hint="Al menos 30 días después de hoy, como prometen los términos."
        value={day}
        error={invalid.day ?? fieldError(schedule.error, 'effective_on')}
        onChange={(e) => {
          schedule.reset();
          setInvalid({ ...invalid, day: undefined });
          setDay(e.target.value);
        }}
      />
      <FormAlert message={formError(schedule.error)} />
      <div className="bo-dialog-actions">
        <button type="submit" className="btn btn--primary" disabled={schedule.isPending}>
          {schedule.isPending ? 'Programando…' : 'Programar y avisar'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** The pending change in words, or nothing. */
function PendingChange({ change }: { change: PendingPriceChange }) {
  return (
    <p className="fine">
      Desde el {formatDate(change.effective_on)}: {formatMoney(change.price_ars_month)} y{' '}
      {formatMoney(change.price_usd_month, 'USD')} por mes. Avisado a {change.notices_sent} de{' '}
      {subscriptions(change.notices)}.
    </p>
  );
}

/** One plan's two prices, sent together (`PUT precios/{code}/` needs both). */
function PriceForm({ price }: { price: PlanPrice }) {
  const [dialog, setDialog] = useState<'schedule' | 'cancel' | null>(null);
  const close = () => setDialog(null);
  const [text, setText] = useState<Record<Field, string>>({
    price_ars_month: asText(price.price_ars_month),
    price_usd_month: asText(price.price_usd_month),
  });
  const [invalid, setInvalid] = useState<Partial<Record<Field, string>>>({});
  const save = useBackofficeMutation((input: PriceInput) => updatePrice(price.code, input));

  function edit(field: Field, value: string) {
    save.reset();
    setInvalid({ ...invalid, [field]: undefined });
    setText({ ...text, [field]: value });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const ars = parsePrice(text.price_ars_month);
    const usd = parsePrice(text.price_usd_month);
    const errors: Partial<Record<Field, string>> = {};
    if (ars === undefined) errors.price_ars_month = NOT_A_WHOLE_NUMBER;
    if (usd === undefined) errors.price_usd_month = NOT_A_WHOLE_NUMBER;
    setInvalid(errors);
    if (ars === undefined || usd === undefined) return;
    save.mutate({ price_ars_month: ars, price_usd_month: usd });
  }

  const error = (field: Field) => invalid[field] ?? fieldError(save.error, field);
  const change = price.pending_change;
  return (
    <>
      <form className="panel bo-price" onSubmit={submit} noValidate>
        <fieldset className="bo-price-set">
          <legend className="bo-price-name">{price.name}</legend>
          <div className="bo-price-fields">
            <TextField
              label="Pesos por mes"
              name="price_ars_month"
              inputMode="numeric"
              autoComplete="off"
              value={text.price_ars_month}
              error={error('price_ars_month')}
              onChange={(e) => edit('price_ars_month', e.target.value)}
            />
            <TextField
              label="Dólares por mes"
              name="price_usd_month"
              inputMode="numeric"
              autoComplete="off"
              value={text.price_usd_month}
              error={error('price_usd_month')}
              onChange={(e) => edit('price_usd_month', e.target.value)}
            />
          </div>
          <FormAlert message={formError(save.error)} />
          <button type="submit" className="btn btn--secondary" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar precios'}
          </button>
          <Saved message={save.isSuccess ? `Precios de ${price.name} guardados.` : null} />
          {price.code === 'basico' ? null : (
            <div className="bo-price-change">
              <h3 className="bo-price-change-title">Cambio para los suscriptores</h3>
              {change ? (
                <>
                  <PendingChange change={change} />
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setDialog('cancel')}
                  >
                    Cancelar el cambio
                  </button>
                </>
              ) : (
                <>
                  <p className="fine">
                    Guardar precios solo cambia lo que pagan los checkouts nuevos. Para las
                    suscripciones que ya cobran, programalo con 30 días de aviso.
                  </p>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setDialog('schedule')}
                  >
                    Programar un cambio
                  </button>
                </>
              )}
            </div>
          )}
        </fieldset>
      </form>
      {/* Outside the form: the dialog has its own form, and forms do not nest. */}
      <BackofficeDialog
        open={dialog !== null}
        title={
          dialog === 'cancel'
            ? `Cancelar el cambio de ${price.name}`
            : `Programar un precio para ${price.name}`
        }
        onClose={close}
      >
        {dialog === 'schedule' ? (
          <ScheduleForm price={price} onDone={close} onCancel={close} />
        ) : dialog === 'cancel' && change ? (
          <ConfirmAction
            description={
              <p>
                El precio de {price.name} sigue como está y no se manda ningún email. Los avisos que
                ya salieron no se pueden retirar.
              </p>
            }
            confirmLabel="Cancelar el cambio"
            pendingLabel="Cancelando…"
            dismissLabel="Volver"
            danger
            run={() => cancelPriceChange(price.code)}
            onDone={close}
            onCancel={close}
          />
        ) : null}
      </BackofficeDialog>
    </>
  );
}

/** The quarterly price update (S4): both prices of each plan, in pesos and dollars. */
export function Precios() {
  const prices = useBackofficeQuery(queryKeys.backofficeList('precios', {}), listPrices);
  return (
    <div className="bo-tab">
      <p className="fine">
        Se actualizan cada 3 meses. Vacío es «Precio a confirmar» y 0 es gratis. Cada plan guarda
        sus dos precios juntos. A los suscriptores, un precio nuevo en pesos se les programa con 30
        días de aviso.
      </p>
      {prices.data ? (
        <div className="bo-prices">
          {prices.data.map((price) => (
            <PriceForm key={price.code} price={price} />
          ))}
        </div>
      ) : prices.isError ? (
        <LoadFailed error={prices.error} onRetry={() => void prices.refetch()} />
      ) : (
        <Loading what="los precios" />
      )}
    </div>
  );
}
