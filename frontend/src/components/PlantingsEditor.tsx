import { useId, useRef } from 'react';
import { flushSync } from 'react-dom';
import { CROPS, MAX_PLANTINGS, type Crop } from '../api/types';
import { emptyDraft, plantedHa, type PlantingDraft, type PlantingsErrors } from '../lib/crops';
import { CROP_LABELS, formatHa } from '../lib/format';
import { FieldError, SelectField, TextField } from './Field';
import { Icon } from './Icon';

interface PlantingsEditorProps {
  drafts: PlantingDraft[];
  onChange: (drafts: PlantingDraft[]) => void;
  /** By row key, from `validateDrafts`. */
  errors: PlantingsErrors;
  /** A message about the whole list, e.g. the server's "Hasta 8 cultivos por lote.". */
  error?: string;
  /** The lote's hectares: the editor warns when the crops add up to more (S1). */
  loteHa: number | null;
  /** Where a heading already says "Cultivos" (the quick change dialog), only readers hear it. */
  hideLegend?: boolean;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The crops of a lote (cultivos-por-lote S1): a row per crop with its hectares and sowing date,
 * the same crop allowed twice, at most 8 rows and none at all allowed. Shared by the lote form
 * and the quick change on the lote page (S2).
 */
export function PlantingsEditor({
  drafts,
  onChange,
  errors,
  error,
  loteHa,
  hideLegend = false,
}: PlantingsEditorProps) {
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const full = drafts.length >= MAX_PLANTINGS;
  const planted = plantedHa(drafts);
  const over = loteHa !== null && loteHa > 0 && planted !== null && round2(planted) > loteHa;

  const update = (key: string, change: Partial<PlantingDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...change } : d)));

  function add() {
    const draft = emptyDraft();
    // Rendered now, so the new row's crop can take the focus and the farmer picks it next.
    flushSync(() => onChange([...drafts, draft]));
    listRef.current?.querySelector<HTMLElement>(`[data-key="${draft.key}"] select`)?.focus();
  }

  function remove(key: string) {
    flushSync(() => onChange(drafts.filter((d) => d.key !== key)));
    // The removed row took the focus with it: leave it on a control that is still there.
    addRef.current?.focus();
  }

  return (
    <fieldset className="plantings" aria-describedby={`${id}-hint`}>
      <legend className={hideLegend ? 'sr-only' : 'field-label'}>Cultivos</legend>
      <p className="field-hint" id={`${id}-hint`}>
        Si el lote está dividido, cargá cada cultivo con sus hectáreas.
      </p>
      {drafts.length ? (
        <ol ref={listRef} className="plantings-list">
          {drafts.map((draft, index) => {
            const rowErrors = errors[draft.key] ?? {};
            const n = index + 1;
            return (
              <li key={draft.key} className="planting" data-key={draft.key}>
                <fieldset className="planting-set">
                  <legend className="planting-legend">Cultivo {n}</legend>
                  <SelectField
                    label="Cultivo"
                    required
                    name={`plantings.${index}.crop`}
                    value={draft.crop}
                    error={rowErrors.crop}
                    onChange={(e) => update(draft.key, { crop: e.target.value as Crop | '' })}
                  >
                    <option value="">Elegí</option>
                    {CROPS.map((crop) => (
                      <option key={crop} value={crop}>
                        {CROP_LABELS[crop]}
                      </option>
                    ))}
                  </SelectField>
                  <div className="form-row">
                    <TextField
                      label="Hectáreas sembradas"
                      name={`plantings.${index}.area_ha`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={draft.areaHa}
                      error={rowErrors.areaHa}
                      onChange={(e) => update(draft.key, { areaHa: e.target.value })}
                    />
                    <TextField
                      label="Fecha de siembra"
                      name={`plantings.${index}.sowing_date`}
                      type="date"
                      value={draft.sowingDate}
                      error={rowErrors.sowingDate}
                      onChange={(e) => update(draft.key, { sowingDate: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="planting-remove"
                    aria-label={`Quitar cultivo ${n}`}
                    onClick={() => remove(draft.key)}
                  >
                    <Icon name="trash" size={20} />
                    Quitar
                  </button>
                </fieldset>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="plantings-empty">
          <Icon name="sprout" />
          Todavía no cargaste cultivos.
        </p>
      )}
      {/* Always mounted, so a screen reader hears the warning when the sum passes the lote. */}
      <div role="status">
        {over ? (
          <p className="plantings-over">
            <Icon name="alert" size={20} />
            {/* One flex item: bare text nodes beside {values} would each wrap on their own. */}
            <span>
              Los cultivos suman {formatHa(round2(planted))} y el lote tiene {formatHa(loteHa)}.
              Revisá las hectáreas.
            </span>
          </p>
        ) : null}
      </div>
      <FieldError id={`${id}-error`} message={error} />
      <button
        ref={addRef}
        type="button"
        className="btn btn--light btn--block"
        disabled={full}
        aria-describedby={full ? `${id}-full` : undefined}
        onClick={add}
      >
        <Icon name="plus" />
        Agregar cultivo
      </button>
      {full ? (
        <p className="field-hint" id={`${id}-full`}>
          Hasta 8 cultivos por lote.
        </p>
      ) : null}
    </fieldset>
  );
}
