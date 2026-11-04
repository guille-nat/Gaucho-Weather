import { useState } from 'react';
import { Link } from 'react-router';
import type { Lote } from '../api/types';
import { GauchoEmpty } from '../components/GauchoEmpty';
import { Icon } from '../components/Icon';
import { ParcelOutline } from '../components/ParcelOutline';
import { StatusChip } from '../components/StatusChip';
import { useOnline } from '../hooks/useOnline';
import { formatDayMonth, formatTemp, formatTime } from '../lib/format';
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
        pending={!lote.summary}
      />
      <span className="lote-card-head">
        <span className="lote-card-name">{loteTitle(lote)}</span>
        {meta ? <span className="survey-meta">{meta}</span> : null}
        {lote.summary ? (
          <StatusChip tone="none">Pronóstico</StatusChip>
        ) : (
          <StatusChip tone="pending">Sin datos aún</StatusChip>
        )}
      </span>
      {lote.summary ? (
        <span className="lote-card-read">
          <span className="lote-card-say">
            <span className="lote-card-say-label">Mín. esta noche (2{'\u00a0'}m)</span>{' '}
            <span className="lote-card-say-value">{formatTemp(lote.summary.tonight_min_c_2m)}</span>
          </span>
          <span className="lote-card-caveat">{CARD_CAVEAT}</span>
        </span>
      ) : (
        <span className="lote-card-read lote-card-wait">
          Estamos juntando el primer pronóstico de este lote
        </span>
      )}
      <Icon className="lote-card-go" name="chevronRight" size={20} strokeWidth={2.8} />
    </Link>
  );
}

/** Phase 1 shows a plain forecast at 2 m: it must never read as "no frost, safe". */
const CARD_CAVEAT = 'Aún no calculamos la helada en el suelo.';

/** The newest forecast behind the list: the time the data on screen comes from. */
function latestForecast(lotes: Lote[]): string | null {
  const times = lotes.flatMap((l) => (l.summary ? [l.summary.fetched_at] : []));
  return times.length ? times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)) : null;
}

function SkeletonList() {
  return (
    <ul className="lote-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="lote-card lote-card--ghost">
          <span className="ghost ghost--plan" />
          <span className="lote-card-head">
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
  const snapshot = lotes.data;
  // Offline when the browser says so, when the refresh failed, or when the service worker had to
  // answer from its cache. The time shown is when the server produced the data, never "now".
  const stale = snapshot !== undefined && (!online || lotes.isError || snapshot.fromCache);
  const list = snapshot?.items ?? [];
  const count = list.length;
  const forecastAt = latestForecast(list);

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
          {formatDayMonth(today)}
          {forecastAt ? (
            <>
              {' · '}
              <span className="nowrap">Pronóstico de las {formatTime(forecastAt)}</span>
            </>
          ) : null}
        </p>
      </header>

      {snapshot && stale ? (
        <p className="offline-strip" role="status">
          <Icon name="cloudOff" />
          <span>Sin conexión · datos de las {formatTime(snapshot.servedAt)}</span>
        </p>
      ) : null}

      {lotes.isPending ? (
        <SkeletonList />
      ) : lotes.isError && snapshot === undefined ? (
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
              Todavía no avisamos heladas.
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
