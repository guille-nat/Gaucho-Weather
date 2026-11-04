import { useState } from 'react';
import { Link } from 'react-router';
import type { Lote } from '../api/types';
import { GauchoEmpty } from '../components/GauchoEmpty';
import { Icon } from '../components/Icon';
import { ParcelOutline } from '../components/ParcelOutline';
import { LevelChip } from '../components/ForecastView';
import { keepUnits } from '../lib/decisions';
import { OfflineStrip } from '../components/OfflineStrip';
import { StatusChip } from '../components/StatusChip';
import { useOnline } from '../hooks/useOnline';
import { formatDayMonth, formatTemp, formatTime } from '../lib/format';
import { loteMeta, loteTitle } from '../lib/lote';
import { useLotes } from '../query/hooks';

function LoteCard({ lote }: { lote: Lote }) {
  const meta = loteMeta(lote);
  const headline = lote.summary?.headline ?? null;
  return (
    <Link className="lote-card" to={`/lotes/${lote.id}`}>
      <ParcelOutline
        className="lote-card-plan"
        id={lote.id}
        name={lote.name}
        boundary={lote.boundary}
        severity={headline?.level ?? 'none'}
        pending={!lote.summary}
      />
      <span className="lote-card-head">
        <span className="lote-card-name">{loteTitle(lote)}</span>
        {meta ? <span className="lote-meta">{meta}</span> : null}
      </span>
      {lote.summary ? (
        <span className="lote-card-read">
          {headline ? (
            <span className="lote-card-headline">
              <LevelChip level={headline.level} />
              <span>{keepUnits(headline.text)}</span>
            </span>
          ) : null}
          <span className="lote-card-say">
            <span className="lote-card-say-label">Mín. esta noche (2{'\u00a0'}m)</span>{' '}
            <span className="lote-card-say-value">{formatTemp(lote.summary.tonight_min_c_2m)}</span>
          </span>
        </span>
      ) : (
        <span className="lote-card-read lote-card-wait">
          <StatusChip tone="pending">Sin datos aún</StatusChip>
          <span>Estamos juntando el primer pronóstico de este lote</span>
        </span>
      )}
      <Icon className="lote-card-go" name="chevronRight" size={22} strokeWidth={2.6} />
    </Link>
  );
}

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
            <span className="ghost ghost--line ghost--short" />
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
        Marcá dónde está cada lote y te decimos si hiela, si podés pulverizar y cuándo llueve ahí
        mismo, no en el pueblo.
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
          <h1 className="page-title">Mis lotes</h1>
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

      {snapshot && stale ? <OfflineStrip servedAt={snapshot.servedAt} /> : null}

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
