import { ApiError } from '../api/client';
import type { Crop, Lote, Planting, PlantingInput } from '../api/types';
import { CROP_LABELS, parseDecimal } from './format';

/** A lote persisted by a build from before plantings existed has none listed. */
export const plantingsOf = (lote: Lote): Planting[] => lote.plantings ?? [];

/** `['Soja', 'Maíz']`: each crop once (two sowings of soja read "Soja"), in the lote's order. */
export const cropLabels = (plantings: Planting[]): string[] => [
  ...new Set(plantings.map((p) => CROP_LABELS[p.crop])),
];

/** One row of the crops editor, as typed. `key` keeps React rows stable across removals. */
export interface PlantingDraft {
  key: string;
  crop: Crop | '';
  /** With the decimal comma, as the farmer types it. */
  areaHa: string;
  sowingDate: string;
}

export type PlantingErrors = Partial<Record<'crop' | 'areaHa' | 'sowingDate', string>>;

/** By row key, so removing a row never moves an error onto its neighbour. */
export type PlantingsErrors = Record<string, PlantingErrors>;

let lastKey = 0;
const nextKey = () => `planting-${++lastKey}`;

export const emptyDraft = (): PlantingDraft => ({
  key: nextKey(),
  crop: '',
  areaHa: '',
  sowingDate: '',
});

export const draftsFrom = (plantings: Planting[]): PlantingDraft[] =>
  plantings.map((p) => ({
    key: nextKey(),
    crop: p.crop,
    // `"70.00"` → `70`, `"12.50"` → `12,5`: the way the farmer would write it.
    areaHa: p.area_ha === null ? '' : String(Number(p.area_ha)).replace('.', ','),
    sowingDate: p.sowing_date ?? '',
  }));

/** The hectares of the rows that have them, or null when none has. */
export function plantedHa(drafts: PlantingDraft[]): number | null {
  const known = drafts
    .map((d) => parseDecimal(d.areaHa))
    .filter((ha): ha is number => ha !== null && ha > 0);
  return known.length ? known.reduce((sum, ha) => sum + ha, 0) : null;
}

/** Client checks mirror the API's, so the farmer gets the answer without a round trip. */
export function validateDrafts(drafts: PlantingDraft[]): {
  errors: PlantingsErrors;
  input?: PlantingInput[];
} {
  const errors: PlantingsErrors = {};
  for (const draft of drafts) {
    const rowErrors: PlantingErrors = {};
    if (!draft.crop) rowErrors.crop = 'Elegí el cultivo.';
    const area = parseDecimal(draft.areaHa);
    if (draft.areaHa.trim() && (area === null || area <= 0))
      rowErrors.areaHa = 'Escribí las hectáreas con números, por ejemplo 40,5.';
    if (Object.keys(rowErrors).length) errors[draft.key] = rowErrors;
  }
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: drafts.map((draft) => {
      const area = parseDecimal(draft.areaHa);
      return {
        crop: draft.crop as Crop,
        area_ha: area === null ? null : area.toFixed(2),
        sowing_date: draft.sowingDate || null,
      };
    }),
  };
}

/**
 * The API's message for the whole list, e.g. "Hasta 8 cultivos por lote.". The client flattens
 * DRF's per-row objects into "[object Object]" strings, so those only say that some row failed.
 */
export function plantingsError(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const messages = error.fieldErrors.plantings;
  if (!messages?.length) return undefined;
  return messages.find((m) => !m.startsWith('[object')) ?? 'Revisá los cultivos.';
}
