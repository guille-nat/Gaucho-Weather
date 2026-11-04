import { lazy, Suspense, useId, useState } from 'react';
import { formatCoord, parseDecimal } from '../lib/format';
import { FieldError } from './Field';
import { Icon } from './Icon';
import type { LatLon } from './MapPicker';

// MapLibre is ~800 kB: load it only when someone is placing a lote.
const MapPicker = lazy(() => import('./MapPicker'));

export interface LocationText {
  lat: string;
  lon: string;
}

interface LocationFieldProps {
  value: LocationText;
  onChange: (value: LocationText) => void;
  error?: string;
}

const toText = ({ lat, lon }: LatLon): LocationText => ({
  lat: lat.toFixed(6),
  lon: lon.toFixed(6),
});

function toPoint(value: LocationText): LatLon | null {
  const lat = parseDecimal(value.lat);
  const lon = parseDecimal(value.lon);
  return lat === null || lon === null ? null : { lat, lon };
}

function geolocationMessage(error: GeolocationPositionError) {
  return error.code === error.PERMISSION_DENIED
    ? 'El navegador no nos dejó usar tu ubicación. Habilitá el permiso o marcá el lote en el mapa.'
    : 'No pudimos obtener tu ubicación. Probá de nuevo al aire libre o marcá el lote en el mapa.';
}

export function LocationField({ value, onChange, error }: LocationFieldProps) {
  const id = useId();
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const point = toPoint(value);

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setGpsError('Este teléfono no informa la ubicación. Marcá el lote en el mapa.');
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange(toText({ lat: position.coords.latitude, lon: position.coords.longitude }));
      },
      (failure) => {
        setLocating(false);
        setGpsError(geolocationMessage(failure));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  const message = gpsError ?? error;

  return (
    <fieldset
      className="location"
      aria-describedby={[`${id}-help`, message ? `${id}-error` : ''].join(' ').trim()}
    >
      <legend className="field-label">
        Ubicación<span className="field-req"> (obligatorio)</span>
      </legend>
      <p className="field-hint" id={`${id}-help`}>
        Tocá el mapa donde está el lote, o usá tu ubicación si estás parado en él.
      </p>
      <div className="map-frame">
        <Suspense fallback={<p className="map-loading">Cargando mapa…</p>}>
          <MapPicker value={point} onPick={(next) => onChange(toText(next))} />
        </Suspense>
      </div>
      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={locateMe}
        aria-busy={locating || undefined}
        disabled={locating}
      >
        <Icon name="crosshair" />
        {locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
      </button>
      <p className="location-readout" aria-live="polite">
        <Icon name="pin" size={18} />
        {point
          ? `Marcado en ${formatCoord(point.lat)}, ${formatCoord(point.lon)}`
          : 'Todavía no marcaste el lote.'}
      </p>
      <div className="coords">
        <div className="field">
          <label className="field-label field-label--small" htmlFor={`${id}-lat`}>
            Latitud
          </label>
          <input
            id={`${id}-lat`}
            className="input"
            inputMode="decimal"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            autoComplete="off"
            placeholder="−33,4592"
            value={value.lat}
            onChange={(e) => onChange({ ...value, lat: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label field-label--small" htmlFor={`${id}-lon`}>
            Longitud
          </label>
          <input
            id={`${id}-lon`}
            className="input"
            inputMode="decimal"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            autoComplete="off"
            placeholder="−61,4831"
            value={value.lon}
            onChange={(e) => onChange({ ...value, lon: e.target.value })}
          />
        </div>
      </div>
      <FieldError id={`${id}-error`} message={message} />
    </fieldset>
  );
}
