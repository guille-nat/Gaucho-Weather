import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Lote, LoteSummary } from '../api/types';
import { FormAlert } from '../components/Field';
import { Icon } from '../components/Icon';
import { ParcelOutline } from '../components/ParcelOutline';
import { StatusChip } from '../components/StatusChip';
import {
  CROP_LABELS,
  formatCoord,
  formatDate,
  formatHa,
  formatTemp,
  formatTime,
  MODEL_LABELS,
} from '../lib/format';
import { loteMeta } from '../lib/lote';
import { useDeleteLote, useLote } from '../query/hooks';

/** Phase 1 shows a plain forecast at 2 m: it must never read as "no frost, safe". */
const DETAIL_CAVEAT =
  'Temperatura a 2\u00a0m de altura. Todavía no calculamos la helada a nivel del suelo.';

function Tonight({ summary }: { summary: LoteSummary | null }) {
  if (!summary) {
    return (
      <div className="tonight tonight--pending">
        <h2 id="sec-tonight" className="sr-only">
          Esta noche
        </h2>
        <StatusChip tone="pending">Sin datos aún</StatusChip>
        <p className="tonight-wait">Estamos juntando el primer pronóstico de este lote</p>
        <p className="tonight-fine">
          Descargamos el pronóstico cada 6 horas. Volvé a mirar más tarde.
        </p>
      </div>
    );
  }
  const models = Object.entries(summary.tonight_min_models).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  return (
    <div className="tonight">
      <StatusChip tone="none">Pronóstico</StatusChip>
      <h2 id="sec-tonight" className="tonight-label">
        Mínima esta noche a 2{'\u00a0'}m
      </h2>
      <p className="tonight-value">{formatTemp(summary.tonight_min_c_2m)}</p>
      <p className="tonight-caveat">{DETAIL_CAVEAT}</p>
      {models.length ? (
        <details className="models-more">
          <summary>
            <Icon name="chevronRight" size={20} strokeWidth={2.6} />
            Ver modelos
          </summary>
          <ul className="models" aria-label="Mínima por modelo">
            {models.map(([model, value]) => (
              <li key={model}>
                <span className="models-name">{MODEL_LABELS[model] ?? model}</span>
                <span className="models-value">{formatTemp(value)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="tonight-fine">
        Pronóstico descargado a las {formatTime(summary.fetched_at)}. Los avisos de helada llegan en
        la próxima versión.
      </p>
    </div>
  );
}

function Facts({ lote }: { lote: Lote }) {
  const rows: [string, string][] = [
    ['Establecimiento', lote.establishment || '—'],
    ['Localidad', lote.locality || '—'],
    ['Cultivo', lote.crop ? CROP_LABELS[lote.crop] : 'Sin definir'],
    ['Fecha de siembra', lote.sowing_date ? formatDate(lote.sowing_date) : 'Sin definir'],
    ['Superficie', lote.area_ha ? formatHa(lote.area_ha) : 'Sin definir'],
    ['Ubicación', `${formatCoord(lote.latitude)}, ${formatCoord(lote.longitude)}`],
  ];
  return (
    <dl className="facts">
      {rows.map(([term, value]) => (
        <div key={term} className="facts-row">
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DeleteLote({ lote }: { lote: Lote }) {
  const [asking, setAsking] = useState(false);
  const remove = useDeleteLote(lote.id);
  const navigate = useNavigate();

  if (!asking) {
    return (
      <button type="button" className="btn btn--danger btn--block" onClick={() => setAsking(true)}>
        <Icon name="trash" />
        Borrar lote
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-labelledby="confirm-delete">
      <p id="confirm-delete" className="confirm-text">
        ¿Borrar {lote.name}? Se pierden sus datos y no se puede deshacer.
      </p>
      <FormAlert message={remove.error?.message} />
      <div className="confirm-actions">
        <button
          type="button"
          className="btn btn--danger-solid"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })
          }
        >
          {remove.isPending ? 'Borrando…' : 'Sí, borrar'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setAsking(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function LoteDetail() {
  const id = Number(useParams().id);
  const lote = useLote(id);

  if (!lote.data) {
    return (
      <div className="page">
        <Link className="back-link" to="/">
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Mis lotes
        </Link>
        <p className="notice">
          {lote.isError
            ? lote.error.message === 'No encontrado.'
              ? 'No encontramos ese lote.'
              : lote.error.message
            : 'Cargando lote…'}
        </p>
      </div>
    );
  }

  const data = lote.data;
  const meta = loteMeta(data);
  return (
    <div className="page page-detail">
      <header className="detail-head">
        <Link className="back-link" to="/">
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Mis lotes
        </Link>
        <div className="detail-hero">
          <ParcelOutline
            className="detail-plan"
            id={data.id}
            name={data.name}
            boundary={data.boundary}
            pending={!data.summary}
          />
          <div className="detail-titles">
            <h1 className="detail-name">{data.name}</h1>
            {data.establishment ? <p className="detail-est">{data.establishment}</p> : null}
            {meta ? <p className="survey-meta">{meta}</p> : null}
          </div>
        </div>
      </header>

      <section className="section" aria-labelledby="sec-tonight">
        <Tonight summary={data.summary} />
      </section>

      <section className="section" aria-labelledby="sec-facts">
        <h2 id="sec-facts" className="survey-label">
          Datos del lote
        </h2>
        <Facts lote={data} />
      </section>

      <div className="detail-actions">
        <Link className="btn btn--secondary btn--block" to={`/lotes/${data.id}/editar`}>
          <Icon name="pencil" />
          Editar lote
        </Link>
        <DeleteLote lote={data} />
      </div>
    </div>
  );
}
