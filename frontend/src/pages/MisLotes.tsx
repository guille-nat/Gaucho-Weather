import { useState } from 'react';
import { Link } from 'react-router';
import type { Lote } from '../api/types';
import { GauchoEmpty } from '../components/GauchoEmpty';
import { Icon } from '../components/Icon';
import { ParcelOutline } from '../components/ParcelOutline';
import { StatusChip } from '../components/StatusChip';
import { useOnline } from '../hooks/useOnline';
import { formatLongDate, formatTemp, formatTime } from '../lib/format';
import { loteMeta, loteTitle } from '../lib/lote';
import { useLotes } from '../query/hooks';

function LoteCard({ lote }: { lote: Lote }) {
  const meta = loteMeta(lote);
  return (
    <Link className="lote-card" to={`/lotes/${lote.id}`}>
      <ParcelOutline
        className="lote-card-plan"
        id={lote.id}
        name={lote.name}
        boundary={lote.boundary}
        areaHa={lote.area_ha}
      />
      <span className="lote-card-body">
        <span className="lote-card-name">{loteTitle(lote)}</span>
        {meta ? <span className="survey-meta">{meta}</span> : null}
        {lote.summary ? (
          <>
            <StatusChip tone="none">Pronóstico</StatusChip>
            <span className="lote-card-say">
              {/* No-break spaces keep "a 2 m" together on a narrow phone. */}
              <span className="lote-card-say-label">
                {'Mínima esta noche a\u00a02\u00a0m:'}
              </span>{' '}
              <span className="lote-card-say-value">
                {formatTemp(lote.summary.tonight_min_c_2m)}
              </span>
            </span>
          </>
        ) : (
          <>
            <StatusChip tone="pending">Sin datos aún</StatusChip>
            <span className="lote-card-wait">
              Estamos juntando el primer pronóstico de este lote
            </span>
          </>
        )}
      </span>
      <Icon className="lote-card-go" name="chevronRight" size={20} strokeWidth={2.8} />
    </Link>
  );
}

function SkeletonList() {
  return (
    <ul className="lote-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="lote-card lote-card--ghost">
          <span className="ghost ghost--plan" />
          <span className="lote-card-body">
            <span className="ghost ghost--line" />
            <span className="ghost ghost--line ghost--short" />
            <span className="ghost ghost--chip" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <section className="empty" aria-labelledby="empty-title">
      <GauchoEmpty />
      <h2 id="empty-title" className="empty-title">
        Todavía no cargaste ningún lote
      </h2>
      <p className="empty-text">
        Marcá dónde está cada lote y te mostramos la mínima de esta noche ahí mismo, no la del
        pueblo.
      </p>
      <Link className="btn btn--primary btn--block" to="/lotes/nuevo">
        <Icon name="plus" strokeWidth={2.6} />
        Agregá tu primer lote
      </Link>
    </section>
  );
}

export function MisLotes() {
  const lotes = useLotes();
  const [today] = useState(() => Date.now());
  const online = useOnline();
  const updatedAt = lotes.dataUpdatedAt ? formatTime(lotes.dataUpdatedAt) : null;
  const stale = lotes.data !== undefined && (!online || lotes.isError);
  const list = lotes.data ?? [];
  const count = list.length;

  return (
    <div className="page page-lotes">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="survey-title">Mis lotes</h1>
          <button
            type="button"
            className="icon-btn"
            aria-label="Actualizar"
            onClick={() => void lotes.refetch()}
            disabled={!online || lotes.isFetching}
          >
            <Icon
              name="refresh"
              size={24}
              strokeWidth={2.4}
              className={lotes.isFetching ? 'spin' : undefined}
            />
          </button>
        </div>
        <p className="page-head-meta">
          {formatLongDate(today)}
          {updatedAt && !stale ? (
            <>
              {' · '}
              <span className="nowrap">Actualizado {updatedAt}</span>
            </>
          ) : null}
        </p>
      </header>

      {stale && updatedAt ? (
        <p className="offline-strip" role="status">
          <Icon name="cloudOff" />
          <span>Sin conexión · datos de las {updatedAt}</span>
        </p>
      ) : null}

      {lotes.isPending ? (
        <SkeletonList />
      ) : lotes.isError && lotes.data === undefined ? (
        <div className="notice">
          <p>{lotes.error.message}</p>
          <button type="button" className="btn btn--secondary" onClick={() => void lotes.refetch()}>
            <Icon name="refresh" />
            Reintentar
          </button>
        </div>
      ) : count === 0 ? (
        <EmptyState />
      ) : (
        <>
          <p className="attention">
            <Icon name="info" size={20} />
            <span>
              <strong>
                {count} {count === 1 ? 'lote' : 'lotes'}.
              </strong>{' '}
              Por ahora te mostramos la mínima pronosticada; los avisos de helada llegan en la
              próxima versión.
            </span>
          </p>
          <ul className="lote-list" aria-label="Lotes">
            {list.map((lote) => (
              <li key={lote.id}>
                <LoteCard lote={lote} />
              </li>
            ))}
          </ul>
          <div className="dock">
            <Link className="btn btn--primary btn--block" to="/lotes/nuevo">
              <Icon name="plus" strokeWidth={2.6} />
              Agregar lote
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
