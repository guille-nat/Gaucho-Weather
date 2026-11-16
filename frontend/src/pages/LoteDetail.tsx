import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import type { Lote } from '../api/types';
import { FormAlert } from '../components/Field';
import { ForecastSkeleton, ForecastView } from '../components/ForecastView';
import { Icon } from '../components/Icon';
import { OfflineStrip } from '../components/OfflineStrip';
import { StatusChip } from '../components/StatusChip';
import { useOnline } from '../hooks/useOnline';
import { CROP_LABELS, formatCoord, formatDate, formatHa } from '../lib/format';
import { loteMeta } from '../lib/lote';
import { applySky, skyTheme } from '../lib/sky';
import { useDeleteLote, useLote, useLoteForecast } from '../query/hooks';

/** The forecast part of the lote: the Inicio layout plus its decisions (S5). */
function LoteForecast({ lote, header }: { lote: Lote; header: ReactNode }) {
  const forecast = useLoteForecast(lote.id);
  const online = useOnline();
  const snapshot = forecast.data;

  useEffect(() => {
    if (snapshot) applySky(skyTheme(snapshot.forecast));
  }, [snapshot]);

  const stale = snapshot !== undefined && (!online || forecast.isError || snapshot.fromCache);
  const models = Object.entries(lote.summary?.tonight_min_models ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  const noForecast = forecast.error instanceof ApiError && forecast.error.status === 404;
  const fallback = forecast.isPending ? (
    <ForecastSkeleton label="Cargando el pronóstico del lote…" />
  ) : noForecast || !lote.summary ? (
    <div className="panel pending">
      <StatusChip tone="pending">Sin datos aún</StatusChip>
      <p className="pending-title">Estamos juntando el primer pronóstico de este lote</p>
      <p className="fine">Descargamos el pronóstico cada 6 horas. Volvé a mirar más tarde.</p>
    </div>
  ) : (
    <div className="notice notice--error" role="alert">
      <Icon name="alertCircle" />
      <p>{forecast.error?.message}</p>
      <button type="button" className="btn btn--light" onClick={() => void forecast.refetch()}>
        <Icon name="refresh" />
        Reintentar
      </button>
    </div>
  );
  return (
    <ForecastView
      forecast={snapshot?.forecast ?? null}
      fallback={fallback}
      header={header}
      decisions="block"
      frostModels={models}
      notice={stale ? <OfflineStrip servedAt={snapshot.servedAt} /> : null}
    />
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
    <dl className="facts panel">
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
            remove.mutate(undefined, { onSuccess: () => navigate('/lotes', { replace: true }) })
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
        <Link className="back-link" to="/lotes">
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
  const header = (
    <header className="place-bar place-bar--lote">
      <div className="place-names">
        <Link className="back-link" to="/lotes">
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Mis lotes
        </Link>
        <h1 className="place-name">{data.name}</h1>
        <p className="place-region">{[data.establishment, meta].filter(Boolean).join(' · ')}</p>
      </div>
      <Link
        className="icon-btn icon-btn--solid"
        to={`/lotes/${data.id}/editar`}
        aria-label="Editar lote"
      >
        <Icon name="pencil" size={22} strokeWidth={2.4} />
      </Link>
    </header>
  );
  return (
    <div className="page page-detail">
      <LoteForecast lote={data} header={header} />

      <section className="section lote-history" aria-label="Histórico">
        <Link className="history-link" to={`/lotes/${data.id}/historico`}>
          <Icon name="history" size={26} />
          <span className="history-link-text">
            <span className="history-link-title">Histórico de clima y viento</span>
            <span className="fine">Viento hora por hora para tus registros de aplicación</span>
          </span>
          <Icon name="chevronRight" strokeWidth={2.6} />
        </Link>
      </section>

      <section className="section lote-facts" aria-labelledby="sec-facts">
        <h2 id="sec-facts" className="panel-title">
          Datos del lote
        </h2>
        <Facts lote={data} />
        <div className="detail-actions">
          <Link className="btn btn--light btn--block" to={`/lotes/${data.id}/editar`}>
            <Icon name="pencil" />
            Editar lote
          </Link>
          <DeleteLote lote={data} />
        </div>
      </section>
    </div>
  );
}
