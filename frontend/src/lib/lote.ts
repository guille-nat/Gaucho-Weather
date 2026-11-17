import type { Lote } from '../api/types';
import { cropLabels, plantingsOf } from './crops';
import { formatHa } from './format';

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
