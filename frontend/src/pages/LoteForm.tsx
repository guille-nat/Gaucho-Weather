import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { CROPS, type Crop, type Lote, type LoteInput } from '../api/types';
import { FormAlert, SelectField, TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { LocationField, type LocationText } from '../components/LocationField';
import { CROP_LABELS, parseDecimal } from '../lib/format';
import { useCreateLote, useLote, useUpdateLote } from '../query/hooks';

interface FormState {
  name: string;
  establishment: string;
  locality: string;
  location: LocationText;
  crop: Crop | '';
  sowingDate: string;
  areaHa: string;
}

type Errors = Partial<
  Record<
    'name' | 'location' | 'areaHa' | 'crop' | 'sowingDate' | 'establishment' | 'locality',
    string
  >
>;

const EMPTY: FormState = {
  name: '',
  establishment: '',
  locality: '',
  location: { lat: '', lon: '' },
  crop: '',
  sowingDate: '',
  areaHa: '',
};

function fromLote(lote: Lote): FormState {
  return {
    name: lote.name,
    establishment: lote.establishment,
    locality: lote.locality,
    location: { lat: String(lote.latitude), lon: String(lote.longitude) },
    crop: lote.crop ?? '',
    sowingDate: lote.sowing_date ?? '',
    areaHa: lote.area_ha === null ? '' : String(lote.area_ha).replace('.', ','),
  };
}

/** Client-side checks mirror the S8 rules so the farmer gets the answer without a round trip. */
function validate(form: FormState): { errors: Errors; input?: LoteInput } {
  const errors: Errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Poné un nombre al lote.';
  else if (name.length > 80) errors.name = 'Usá hasta 80 caracteres.';

  const latText = form.location.lat.trim();
  const lonText = form.location.lon.trim();
  const lat = parseDecimal(latText);
  const lon = parseDecimal(lonText);
  if (!latText && !lonText) errors.location = 'Marcá el lote en el mapa o usá tu ubicación.';
  else if (lat === null || lon === null)
    errors.location = 'Revisá las coordenadas: escribilas con números, por ejemplo −33,4592.';
  else if (lat < -56 || lat > -21 || lon < -74 || lon > -53)
    errors.location = 'Esa ubicación queda fuera de la Argentina.';

  const area = parseDecimal(form.areaHa);
  if (form.areaHa.trim() && (area === null || area < 0))
    errors.areaHa = 'Escribí las hectáreas con números, por ejemplo 120,5.';

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: {
      name,
      establishment: form.establishment.trim(),
      locality: form.locality.trim(),
      latitude: Number(lat!.toFixed(6)),
      longitude: Number(lon!.toFixed(6)),
      crop: form.crop || null,
      sowing_date: form.sowingDate || null,
      area_ha: area === null ? null : Number(area.toFixed(2)),
    },
  };
}

const SERVER_FIELDS: Record<string, keyof Errors> = {
  name: 'name',
  establishment: 'establishment',
  locality: 'locality',
  latitude: 'location',
  longitude: 'location',
  crop: 'crop',
  sowing_date: 'sowingDate',
  area_ha: 'areaHa',
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
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validate(form);
    setErrors(result.errors);
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
        <h1 className="survey-title">{title}</h1>
      </header>
      <form ref={formRef} className="form" onSubmit={submit} noValidate>
        <FormAlert message={alert} />
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
          onChange={(location) => set('location', location)}
        />
        <div className="form-row">
          <SelectField
            label="Cultivo"
            name="crop"
            value={form.crop}
            error={shown.crop}
            onChange={(e) => set('crop', e.target.value as Crop | '')}
          >
            <option value="">Sin definir</option>
            {CROPS.map((crop) => (
              <option key={crop} value={crop}>
                {CROP_LABELS[crop]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Hectáreas"
            name="area_ha"
            inputMode="decimal"
            autoComplete="off"
            placeholder="120,5"
            value={form.areaHa}
            error={shown.areaHa}
            onChange={(e) => set('areaHa', e.target.value)}
          />
        </div>
        <TextField
          label="Fecha de siembra"
          name="sowing_date"
          type="date"
          value={form.sowingDate}
          error={shown.sowingDate}
          onChange={(e) => set('sowingDate', e.target.value)}
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
      cancelTo="/"
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
