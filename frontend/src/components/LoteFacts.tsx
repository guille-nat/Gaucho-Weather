import { useId, type CSSProperties, type ReactNode } from 'react';
import type { Lote, Planting } from '../api/types';
import { plantingsOf } from '../lib/crops';
import { CROP_LABELS, formatCoord, formatDate, formatHa } from '../lib/format';
import { Icon, type IconName } from './Icon';

function FactGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="fact-group panel" aria-labelledby={id}>
      <h3 id={id} className="fact-group-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FactList({ facts }: { facts: [IconName, string, string][] }) {
  return (
    <dl className="fact-list">
      {facts.map(([icon, term, value]) => (
        <div key={term} className="fact">
          <dt>
            <Icon name={icon} />
            {term}
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CropChip({ planting }: { planting: Planting }) {
  const meta = [
    planting.area_ha === null ? null : formatHa(Number(planting.area_ha)),
    planting.sowing_date ? `siembra ${formatDate(planting.sowing_date)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // The colour mark tells crops apart at a glance; the label always says which one it is.
  const style = { '--crop': `var(--crop-${planting.crop})` } as CSSProperties;
  return (
    <li className="crop-chip" style={style}>
      <span className="crop-chip-mark" aria-hidden="true" />
      <span className="crop-chip-name">{CROP_LABELS[planting.crop]}</span>
      {meta ? (
        <span className="crop-chip-meta">
          <span className="sr-only">: </span>
          {meta}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The lote sheet (cultivos-por-lote S3): crops, the field and the place, each in its own group,
 * every fact with an icon. `cropsAction` is the one way to change the crops from here (S2).
 */
export function LoteFacts({ lote, cropsAction }: { lote: Lote; cropsAction: ReactNode }) {
  const plantings = plantingsOf(lote);
  return (
    <div className="lote-sheet">
      <FactGroup title="Cultivos">
        {plantings.length ? (
          <ul className="crop-chips" aria-label="Cultivos del lote">
            {plantings.map((planting) => (
              <CropChip key={planting.id} planting={planting} />
            ))}
          </ul>
        ) : (
          <p className="crops-empty">
            <Icon name="sprout" />
            Sin cultivos cargados
          </p>
        )}
        {cropsAction}
      </FactGroup>
      <FactGroup title="Campo">
        <FactList
          facts={[
            ['parcel', 'Superficie', lote.area_ha ? formatHa(lote.area_ha) : 'Sin definir'],
            [
              'crosshair',
              'Ubicación',
              `${formatCoord(lote.latitude)}, ${formatCoord(lote.longitude)}`,
            ],
          ]}
        />
      </FactGroup>
      <FactGroup title="Lugar">
        <FactList
          facts={[
            ['barn', 'Establecimiento', lote.establishment || '—'],
            ['pin', 'Localidad', lote.locality || '—'],
          ]}
        />
      </FactGroup>
    </div>
  );
}
