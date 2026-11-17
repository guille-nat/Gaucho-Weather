import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, isPlanLimit } from '../api/client';
import type { Lote, LoteInput } from '../api/types';
import { FormAlert, TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { LocationField, type LocationText } from '../components/LocationField';
import { PlantingsEditor } from '../components/PlantingsEditor';
import {
  draftsFrom,
  plantingsError,
  plantingsOf,
  validateDrafts,
  type PlantingDraft,
  type PlantingsErrors,
} from '../lib/crops';
import { parseDecimal } from '../lib/format';
import {
  EMPTY_OUTLINE,
  areaHa,
  centroid,
  outlineFromPolygon,
  outlineReducer,
  roundHa,
  toPolygon,
  type Outline,
  type OutlineAction,
} from '../lib/outline';
import { useCreateLote, useLote, useUpdateLote } from '../query/hooks';

interface FormState {
  name: string;
  establishment: string;
  locality: string;
  location: LocationText;
  /** The drawn outline (S7); when closed it fills the hectares and, without a pin, the location. */
  outline: Outline;
  /** The hectares field holds the drawn outline's area, not a typed number. */
  areaFromOutline: boolean;
  /** The crops, a row each (cultivos-por-lote S1). */
  plantings: PlantingDraft[];
  areaHa: string;
}

type Errors = Partial<
  Record<'name' | 'location' | 'areaHa' | 'establishment' | 'locality', string>
>;

const EMPTY: FormState = {
  name: '',
  establishment: '',
  locality: '',
  location: { lat: '', lon: '' },
  outline: EMPTY_OUTLINE,
  areaFromOutline: false,
  plantings: [],
  areaHa: '',
};

function fromLote(lote: Lote): FormState {
  return {
    name: lote.name,
    establishment: lote.establishment,
    locality: lote.locality,
    location: { lat: String(lote.latitude), lon: String(lote.longitude) },
    outline: outlineFromPolygon(lote.boundary),
    areaFromOutline: false,
    plantings: draftsFrom(plantingsOf(lote)),
    areaHa: lote.area_ha === null ? '' : String(lote.area_ha).replace('.', ','),
  };
}

/** `120.5` → `120,5`: the hectares field takes the decimal comma. */
const haText = (value: number) => String(value).replace('.', ',');

/** Applies a drawing step; a closed outline writes its area into the hectares field. */
function withOutline(form: FormState, action: OutlineAction): FormState {
  const outline = outlineReducer(form.outline, action);
  if (outline === form.outline) return form;
  if (outline.closed) {
    return {
      ...form,
      outline,
      areaHa: haText(roundHa(areaHa(outline.points))),
      areaFromOutline: true,
    };
  }
  return { ...form, outline, areaHa: form.areaFromOutline ? '' : form.areaHa };
}

/** Client-side checks mirror the S8 rules so the farmer gets the answer without a round trip. */
function validate(form: FormState): {
  errors: Errors;
  plantingErrors: PlantingsErrors;
  input?: LoteInput;
} {
  const errors: Errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Poné un nombre al lote.';
  else if (name.length > 80) errors.name = 'Usá hasta 80 caracteres.';

  const latText = form.location.lat.trim();
  const lonText = form.location.lon.trim();
  const boundary = toPolygon(form.outline);
  // Without a pin, the lote sits at the centre of its outline (S7).
  const middle = !latText && !lonText && boundary ? centroid(form.outline.points) : null;
  const lat = middle ? middle[1] : parseDecimal(latText);
  const lon = middle ? middle[0] : parseDecimal(lonText);
  if (form.outline.points.length && !form.outline.closed)
    errors.location = 'Cerrá el contorno: tocá la primera esquina o «Cerrar contorno».';
  else if (!latText && !lonText && !middle)
    errors.location = 'Marcá el lote en el mapa o usá tu ubicación.';
  else if (lat === null || lon === null)
    errors.location = 'Revisá las coordenadas: escribilas con números, por ejemplo −33,4592.';
  else if (lat < -56 || lat > -21 || lon < -74 || lon > -53)
    errors.location = 'Esa ubicación queda fuera de la Argentina.';

  const area = parseDecimal(form.areaHa);
  if (form.areaHa.trim() && (area === null || area < 0))
    errors.areaHa = 'Escribí las hectáreas con números, por ejemplo 120,5.';

  const plantings = validateDrafts(form.plantings);
  if (Object.keys(errors).length || !plantings.input)
    return { errors, plantingErrors: plantings.errors };
  return {
    errors,
    plantingErrors: plantings.errors,
    input: {
      name,
      establishment: form.establishment.trim(),
      locality: form.locality.trim(),
      latitude: Number(lat!.toFixed(6)),
      longitude: Number(lon!.toFixed(6)),
      plantings: plantings.input,
      area_ha: area === null ? null : Number(area.toFixed(2)),
      boundary,
    },
  };
}

const SERVER_FIELDS: Record<string, keyof Errors> = {
  name: 'name',
  establishment: 'establishment',
  locality: 'locality',
  latitude: 'location',
  longitude: 'location',
  area_ha: 'areaHa',
  boundary: 'location',
};

function serverErrors(error: unknown): Errors {
  if (!(error instanceof ApiError)) return {};
  const errors: Errors = {};
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const key = SERVER_FIELDS[field];
    if (key && !errors[key]) errors[key] = messages[0];
  }
  return errors;
}

interface LoteFormProps {
  title: string;
  initial: FormState;
  pending: boolean;
  submitError: unknown;
  onSubmit: (input: LoteInput) => void;
  cancelTo: string;
}

function LoteFormView({ title, initial, pending, submitError, onSubmit, cancelTo }: LoteFormProps) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [plantingErrors, setPlantingErrors] = useState<PlantingsErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validate(form);
    setErrors(result.errors);
    setPlantingErrors(result.plantingErrors);
    if (!result.input) {
      // Take the farmer to the first problem instead of leaving them guessing.
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    onSubmit(result.input);
  }

  const shown = { ...serverErrors(submitError), ...errors };
  const alert =
    submitError instanceof ApiError
      ? submitError.message
      : submitError
        ? 'No pudimos guardar el lote.'
        : null;

  return (
    <div className="page page-form">
      <header className="page-head page-head--sub">
        <Link className="back-link" to={cancelTo}>
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Cancelar
        </Link>
        <h1 className="page-title">{title}</h1>
      </header>
      <form ref={formRef} className="form" onSubmit={submit} noValidate>
        <FormAlert message={alert}>
          {isPlanLimit(submitError) ? (
            <Link className="form-alert-link" to="/planes">
              Ver planes
            </Link>
          ) : null}
        </FormAlert>
        <TextField
          label="Nombre del lote"
          required
          name="name"
          maxLength={80}
          autoComplete="off"
          hint="Como lo llaman en el campo, por ejemplo «Lote 4» o «El bajo»."
          value={form.name}
          error={shown.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <TextField
          label="Establecimiento"
          name="establishment"
          autoComplete="off"
          value={form.establishment}
          error={shown.establishment}
          onChange={(e) => set('establishment', e.target.value)}
        />
        <TextField
          label="Localidad"
          name="locality"
          autoComplete="address-level2"
          value={form.locality}
          error={shown.locality}
          onChange={(e) => set('locality', e.target.value)}
        />
        <LocationField
          value={form.location}
          error={shown.location}
          outline={form.outline}
          onOutline={(action) => setForm((f) => withOutline(f, action))}
          onChange={(location) => set('location', location)}
        />
        <TextField
          label="Hectáreas"
          name="area_ha"
          inputMode="decimal"
          autoComplete="off"
          hint={
            form.areaFromOutline
              ? 'Calculadas del contorno. Podés corregirlas.'
              : 'Con coma, por ejemplo 120,5.'
          }
          value={form.areaHa}
          error={shown.areaHa}
          onChange={(e) =>
            setForm((f) => ({ ...f, areaHa: e.target.value, areaFromOutline: false }))
          }
        />
        <PlantingsEditor
          drafts={form.plantings}
          onChange={(plantings) => set('plantings', plantings)}
          errors={plantingErrors}
          error={plantingsError(submitError)}
          loteHa={parseDecimal(form.areaHa)}
        />
        <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar lote'}
        </button>
      </form>
    </div>
  );
}

export function NuevoLote() {
  const navigate = useNavigate();
  const create = useCreateLote();
  return (
    <LoteFormView
      title="Agregar lote"
      initial={EMPTY}
      pending={create.isPending}
      submitError={create.error}
      cancelTo="/lotes"
      onSubmit={(input) =>
        create.mutate(input, {
          onSuccess: (lote) => navigate(`/lotes/${lote.id}`, { replace: true }),
        })
      }
    />
  );
}

export function EditarLote() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const lote = useLote(id);
  const update = useUpdateLote(id);

  if (!lote.data) {
    return (
      <div className="page">
        <p className="notice">{lote.isError ? lote.error.message : 'Cargando lote…'}</p>
      </div>
    );
  }
  return (
    <LoteFormView
      key={lote.data.id}
      title="Editar lote"
      initial={fromLote(lote.data)}
      pending={update.isPending}
      submitError={update.error}
      cancelTo={`/lotes/${id}`}
      onSubmit={(input) =>
        update.mutate(input, { onSuccess: () => navigate(`/lotes/${id}`, { replace: true }) })
      }
    />
  );
}
