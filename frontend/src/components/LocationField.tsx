import { lazy, Suspense, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Place } from '../api/types';
import { useDebounced } from '../hooks/useDebounced';
import type { Basemap } from '../lib/basemaps';
import { formatCoord, formatHa, parseDecimal } from '../lib/format';
import {
  MIN_CORNERS,
  areaHa,
  centroid,
  roundHa,
  type Outline,
  type OutlineAction,
} from '../lib/outline';
import { letters } from '../lib/places';
import { usePlaceSearch } from '../query/hooks';
import { FieldError } from './Field';
import { Icon } from './Icon';
import type { LatLon, MapFocus, MapTool } from './MapPicker';

// MapLibre is ~800 kB: load it only when someone is placing a lote.
const MapPicker = lazy(() => import('./MapPicker'));

export interface LocationText {
  lat: string;
  lon: string;
}

interface LocationFieldProps {
  value: LocationText;
  onChange: (value: LocationText) => void;
  outline: Outline;
  onOutline: (action: OutlineAction) => void;
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

function drawingHint({ points, closed }: Outline) {
  if (closed) {
    return 'Arrastrá una esquina para moverla. Tocá un punto chico para sumar una esquina, o tocá una esquina para quitarla.';
  }
  if (!points.length) return 'Tocá el mapa en cada esquina del lote, en orden.';
  if (points.length < MIN_CORNERS) return 'Seguí tocando las esquinas. Con tres ya podés cerrarlo.';
  return 'Para terminar, tocá la primera esquina o «Cerrar contorno».';
}

/** Localidad o paraje (S7): reuses the place search of Buscar and flies the map there. */
function MapSearch({ onPick }: { onPick: (place: Place) => void }) {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const query = useDebounced(text.trim());
  const search = usePlaceSearch(open ? query : '');
  const results = search.data ?? [];
  const typing = open && text.trim().length > 0;
  const waiting = typing && (query !== text.trim() || search.isFetching);

  function pick(place: Place) {
    setText(place.name);
    setOpen(false);
    onPick(place);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter belongs to the search here, not to the lote form around it.
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = results[0];
    if (first && !waiting) pick(first);
  }

  let status: string | null = null;
  if (typing && !results.length) {
    if (search.isError && !waiting) status = search.error.message;
    else if (waiting || query.length < 2) status = 'Buscando…';
    else if (letters(query) < 5) status = 'Seguí escribiendo…';
    else status = 'No encontramos ese lugar en la Argentina. Probá con otro nombre.';
  }

  return (
    <div className="map-search" role="search">
      <div className="search search--compact">
        <Icon name="search" size={22} strokeWidth={2.4} />
        <input
          className="search-input"
          type="search"
          aria-label="Buscar localidad o paraje"
          aria-describedby={status ? `${id}-status` : undefined}
          placeholder="Buscar localidad o paraje"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div aria-live="polite">
        {typing && results.length ? (
          <ul className="place-list map-search-results" aria-label="Lugares encontrados">
            {results.map((place) => (
              <li key={`${place.lat},${place.lon}`}>
                <button type="button" className="place-option" onClick={() => pick(place)}>
                  <Icon name="pin" size={22} />
                  <span className="place-option-text">
                    <span className="place-option-name">{place.name}</span>
                    {place.region ? (
                      <span className="place-option-region">{place.region}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : status ? (
          <p className="field-hint map-search-status" id={`${id}-status`}>
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={['segmented', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented-option"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function LocationField({ value, onChange, outline, onOutline, error }: LocationFieldProps) {
  const id = useId();
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [tool, setTool] = useState<MapTool>('outline');
  const [basemap, setBasemap] = useState<Basemap>('satellite');
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const center = useRef<LatLon | null>(null);
  const point = toPoint(value);
  const corners = outline.points.length;
  const middle = outline.closed ? centroid(outline.points) : null;
  const liveHa = corners >= MIN_CORNERS ? roundHa(areaHa(outline.points)) : null;

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

  function edit(action: OutlineAction) {
    setSelected(null);
    onOutline(action);
  }

  function tap(at: LatLon) {
    if (tool === 'pin') {
      onChange(toText(at));
    } else if (outline.closed) {
      setSelected(null);
    } else {
      edit({ type: 'add', point: [at.lon, at.lat] });
    }
  }

  function tapCorner(index: number) {
    if (!outline.closed) {
      if (index === 0 && corners >= MIN_CORNERS) edit({ type: 'close' });
      return;
    }
    setSelected((current) => (current === index ? null : index));
  }

  function addAtCenter() {
    if (center.current) edit({ type: 'add', point: [center.current.lon, center.current.lat] });
  }

  const message = gpsError ?? error;
  const coordsDescribedBy = [`${id}-coords-hint`, error ? `${id}-error` : ''].join(' ').trim();
  const canRemove = selected !== null && corners > MIN_CORNERS;

  return (
    <fieldset
      className="location"
      aria-describedby={[`${id}-help`, message ? `${id}-error` : ''].join(' ').trim()}
    >
      <legend className="field-label">
        Ubicación<span className="field-req"> (obligatorio)</span>
      </legend>
      <p className="field-hint" id={`${id}-help`}>
        Buscá el pueblo más cercano, dibujá el contorno tocando las esquinas del lote y calculamos
        las hectáreas. También podés marcar solo un punto o usar tu ubicación.
      </p>

      <MapSearch
        onPick={(place) => setFocus({ lat: place.lat, lon: place.lon, key: Date.now() })}
      />

      <Segmented
        label="Qué marcar en el mapa"
        value={tool}
        onChange={(next) => {
          setTool(next);
          setSelected(null);
        }}
        options={[
          { value: 'outline', label: 'Dibujar contorno' },
          { value: 'pin', label: 'Marcar punto' },
        ]}
      />

      <div className="map-frame">
        <Suspense fallback={<p className="map-loading">Cargando mapa…</p>}>
          <MapPicker
            pin={point}
            outline={outline}
            selected={selected}
            tool={tool}
            basemap={basemap}
            focus={focus}
            onTap={tap}
            onPinMove={(next) => onChange(toText(next))}
            onVertexTap={tapCorner}
            onVertexMove={(index, at) =>
              onOutline({ type: 'move', index, point: [at.lon, at.lat] })
            }
            onMidpoint={(index, at) => edit({ type: 'insert', index, point: [at.lon, at.lat] })}
            onCenter={(at) => {
              center.current = at;
            }}
          />
        </Suspense>
        {tool === 'outline' && !outline.closed ? (
          <span className="map-reticle" aria-hidden="true" />
        ) : null}
        <Segmented
          className="segmented--map"
          label="Tipo de mapa"
          value={basemap}
          onChange={setBasemap}
          options={[
            { value: 'satellite', label: 'Satélite' },
            { value: 'street', label: 'Calles' },
          ]}
        />
      </div>

      {tool === 'outline' ? (
        <div className="draw" aria-label="Contorno del lote" role="group">
          <div className="draw-readout" aria-live="polite">
            <span className="draw-count">
              {corners === 1 ? '1 esquina' : `${corners} esquinas`}
              {outline.closed ? ' · cerrado' : ''}
            </span>
            {liveHa !== null ? <strong className="draw-area">{formatHa(liveHa)}</strong> : null}
          </div>
          <p className="field-hint draw-hint">{drawingHint(outline)}</p>
          <div className="draw-actions">
            {!outline.closed ? (
              <>
                <button type="button" className="btn btn--secondary" onClick={addAtCenter}>
                  <Icon name="plus" />
                  Esquina en la mira
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => edit({ type: 'close' })}
                  disabled={corners < MIN_CORNERS}
                >
                  <Icon name="check" />
                  Cerrar contorno
                </button>
              </>
            ) : null}
            {canRemove ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => edit({ type: 'remove', index: selected ?? -1 })}
              >
                <Icon name="close" />
                Quitar esquina
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => edit({ type: 'undo' })}
              disabled={!corners}
            >
              <Icon name="undo" />
              Deshacer
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => edit({ type: 'clear' })}
              disabled={!corners}
            >
              <Icon name="trash" />
              Borrar contorno
            </button>
          </div>
        </div>
      ) : null}

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
          : middle
            ? `Se guarda el centro del contorno: ${formatCoord(middle[1])}, ${formatCoord(middle[0])}`
            : 'Todavía no marcaste el lote.'}
      </p>
      <p className="field-hint" id={`${id}-coords-hint`}>
        Si tenés las coordenadas, escribilas con coma, por ejemplo −33,4592 y −61,4831.
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
            aria-describedby={coordsDescribedBy}
            autoComplete="off"
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
            aria-describedby={coordsDescribedBy}
            autoComplete="off"
            value={value.lon}
            onChange={(e) => onChange({ ...value, lon: e.target.value })}
          />
        </div>
      </div>
      <FieldError id={`${id}-error`} message={message} />
    </fieldset>
  );
}
