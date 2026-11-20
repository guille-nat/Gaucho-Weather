import { useState, type FormEvent } from 'react';
import { listPrices, updatePrice, type PlanPrice, type PriceInput } from '../../api/backoffice';
import { LoadFailed, Loading } from '../../components/backoffice/Loading';
import { FormAlert, TextField } from '../../components/Field';
import { fieldError, formError } from '../../lib/formErrors';
import { queryKeys } from '../../query/keys';
import { Saved } from '../Perfil';
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

/** One plan's two prices, sent together (`PUT precios/{code}/` needs both). */
function PriceForm({ price }: { price: PlanPrice }) {
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
  return (
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
      </fieldset>
    </form>
  );
}

/** The quarterly price update (S4): both prices of each plan, in pesos and dollars. */
export function Precios() {
  const prices = useBackofficeQuery(queryKeys.backofficeList('precios', {}), listPrices);
  return (
    <div className="bo-tab">
      <p className="fine">
        Se actualizan cada 3 meses. Vacío es «Precio a confirmar» y 0 es gratis. Cada plan guarda
        sus dos precios juntos.
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
