import type { Lote } from '../api/types';
import { CROP_LABELS, formatHa } from './format';

/** Survey meta line: LOCALIDAD · CULTIVO · HA (uppercased by CSS). */
export function loteMeta(lote: Lote): string {
  return (
    [
      lote.locality,
      lote.crop ? CROP_LABELS[lote.crop] : null,
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
