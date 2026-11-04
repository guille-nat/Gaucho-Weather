import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { ForecastSkeleton, ForecastView } from '../components/ForecastView';
import { Icon } from '../components/Icon';
import { OfflineStrip } from '../components/OfflineStrip';
import { useOnline } from '../hooks/useOnline';
import { formatCoord } from '../lib/format';
import { locate, type GeoFailure } from '../lib/geo';
import { DEFAULT_PLACE, getPlaces, setCurrentPlace, usePlaces } from '../lib/places';
import { applySky, skyTheme } from '../lib/sky';
import { useForecast, usePlaceName } from '../query/hooks';

type GeoState = 'idle' | 'locating' | GeoFailure;

/**
 * Inicio (S8): the forecast of where the phone is, or of the place searched, with no account.
 * Location is asked on open unless the user chose a place; denied, it falls back to the last
 * place, or Rosario, and invites a search.
 */
export function Inicio() {
  const { current } = usePlaces();
  const [geo, setGeo] = useState<GeoState>(() =>
    getPlaces().current?.kind === 'search' ? 'idle' : 'locating',
  );

  useEffect(() => {
    if (geo !== 'locating') return;
    let alive = true;
    locate()
      .then((position) => {
        if (!alive) return;
        setCurrentPlace({ kind: 'gps', ...position, name: null, region: null });
        setGeo('idle');
      })
      .catch((failure: GeoFailure) => alive && setGeo(failure));
    return () => {
      alive = false;
    };
    // Asked once per visit; "Usar mi ubicación" in the search asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = current ?? (geo === 'locating' ? null : DEFAULT_PLACE);
  const forecast = useForecast(point);
  const gps = point?.kind === 'gps' ? point : null;
  const reverse = usePlaceName(gps);
  const online = useOnline();
  const snapshot = forecast.data;

  useEffect(() => {
    if (snapshot) applySky(skyTheme(snapshot.forecast));
  }, [snapshot]);

  const geoFailed = geo === 'denied' || geo === 'unavailable';
  const name =
    point?.kind === 'search'
      ? { name: point.name, region: point.region }
      : (reverse.data ?? snapshot?.forecast.place ?? null);
  const placeTitle =
    name?.name ??
    (point ? `${formatCoord(point.lat)}, ${formatCoord(point.lon)}` : 'Buscando tu ubicación…');

  const header = (
    <header className="place-bar">
      <div className="place">
        <Icon name={gps ? 'navigation' : 'pin'} size={22} strokeWidth={2.2} />
        <div className="place-names">
          <h1 className="place-name">{placeTitle}</h1>
          {name?.region ? <p className="place-region">{name.region}</p> : null}
        </div>
      </div>
      <Link className="icon-btn icon-btn--solid" to="/buscar" aria-label="Buscar lugar">
        <Icon name="search" size={24} strokeWidth={2.4} />
      </Link>
    </header>
  );

  const geoNotice = geoFailed ? (
    <div className="notice notice--prompt" role="status">
      <Icon name="pin" />
      <p>No pudimos usar tu ubicación. Buscá tu localidad o paraje para ver su pronóstico.</p>
      <Link className="btn btn--light" to="/buscar">
        <Icon name="search" strokeWidth={2.4} />
        Buscar un lugar
      </Link>
    </div>
  ) : null;

  const stale = snapshot !== undefined && (!online || forecast.isError || snapshot.fromCache);
  const error = !snapshot && forecast.error instanceof ApiError ? forecast.error : null;
  const fallback = error ? (
    <div className="notice notice--error" role="alert">
      <Icon name="alertCircle" />
      <p>{error.message}</p>
      {error.status === 400 ? (
        geoNotice ? null : (
          <Link className="btn btn--light" to="/buscar">
            <Icon name="search" strokeWidth={2.4} />
            Buscar un lugar
          </Link>
        )
      ) : (
        <button type="button" className="btn btn--light" onClick={() => void forecast.refetch()}>
          <Icon name="refresh" />
          Reintentar
        </button>
      )}
    </div>
  ) : (
    <ForecastSkeleton label={point ? 'Cargando el pronóstico…' : 'Buscando tu ubicación…'} />
  );

  return (
    <div className="page page-inicio">
      <ForecastView
        forecast={snapshot?.forecast ?? null}
        fallback={fallback}
        header={header}
        decisions="pill"
        updating={forecast.isPlaceholderData}
        notice={
          <>
            {stale ? <OfflineStrip servedAt={snapshot.servedAt} /> : null}
            {geoNotice}
          </>
        }
      />
    </div>
  );
}
