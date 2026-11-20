import type { Lote } from '../api/types';
import { cropLabels, plantingsOf } from './crops';
import { CROP_LABELS, formatDayMonthNumeric, formatHa } from './format';

/**
 * Survey meta line: LOCALIDAD · CULTIVOS · HA (uppercased by CSS). The lote page leaves the crops
 * out (`crops: false`): it shows them as their own button under the name.
 */
export function loteMeta(lote: Lote, { crops = true }: { crops?: boolean } = {}): string {
  return (
    [
      lote.locality,
      ...(crops ? cropLabels(plantingsOf(lote)) : []),
      lote.area_ha ? formatHa(lote.area_ha) : null,
    ]
      .filter((part): part is string => Boolean(part))
      // Wrap only between parts on a narrow card, never inside "60 ha" or "Chañar Ladeado".
      .map((part) => part.replace(/ /g, '\u00a0'))
      .join(' · ')
  );
}

export const loteTitle = (lote: Lote) =>
  lote.establishment ? `${lote.name} · ${lote.establishment}` : lote.name;

/**
 * The lote page's line under its name (lote-tablero S2): each crop with its sowing date, the
 * hectares, the establishment and the town. `Soja (siembra 20/10) · Maíz · 120 ha · La Esperanza`.
 */
export function loteHeaderLine(lote: Lote): string {
  const crops = plantingsOf(lote).map((p) =>
    p.sowing_date
      ? `${CROP_LABELS[p.crop]} (siembra ${formatDayMonthNumeric(p.sowing_date)})`
      : CROP_LABELS[p.crop],
  );
  return [
    ...new Set(crops),
    lote.area_ha ? formatHa(lote.area_ha) : null,
    lote.establishment,
    lote.locality,
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/ /g, ' '))
    .join(' · ');
}
