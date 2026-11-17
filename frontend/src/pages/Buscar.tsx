import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Place } from '../api/types';
import { CREDITS } from '../components/ForecastView';
import { Icon } from '../components/Icon';
import { useDebounced } from '../hooks/useDebounced';
import { locate } from '../lib/geo';
import {
  choosePlace,
  letters,
  samePlace,
  setCurrentPlace,
  toggleSaved,
  usePlaces,
} from '../lib/places';
import { usePlaceSearch } from '../query/hooks';

function PlaceButton({
  place,
  onPick,
  icon,
}: {
  place: Place;
  onPick: (p: Place) => void;
  icon: 'pin' | 'history';
}) {
  return (
    <button type="button" className="place-option" onClick={() => onPick(place)}>
      <Icon name={icon} size={22} />
      <span className="place-option-text">
        <span className="place-option-name">{place.name}</span>
        {place.region ? <span className="place-option-region">{place.region}</span> : null}
      </span>
    </button>
  );
}

/** A remembered place: pick it, or star it so newer searches never push it out (S8). */
function RememberedPlace({
  place,
  saved,
  onPick,
}: {
  place: Place;
  saved: boolean;
  onPick: (p: Place) => void;
}) {
  return (
    <div className="place-row">
      <PlaceButton place={place} onPick={onPick} icon={saved ? 'pin' : 'history'} />
      <button
        type="button"
        className="place-star"
        aria-label={`Guardar ${place.name}`}
        aria-pressed={saved}
        onClick={() => toggleSaved(place)}
      >
        <Icon name="star" size={24} fill={saved ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

function PlaceSection({
  id,
  title,
  places,
  saved,
  onPick,
}: {
  id: string;
  title: string;
  places: Place[];
  saved: boolean;
  onPick: (p: Place) => void;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="sheet-section">
        {title}
      </h2>
      <ul className="place-list" aria-labelledby={id}>
        {places.map((place) => (
          <li key={`${place.lat},${place.lon}`}>
            <RememberedPlace place={place} saved={saved} onPick={onPick} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The search sheet (S8, S10): a town or paraje of Argentina, the saved and recent ones, or here. */
export function Buscar() {
  const navigate = useNavigate();
  const { recent, saved } = usePlaces();
  const unsaved = recent.filter((place) => !saved.some((s) => samePlace(s, place)));
  const [text, setText] = useState('');
  const query = useDebounced(text.trim());
  const search = usePlaceSearch(query);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function pick(place: Place) {
    choosePlace(place);
    navigate('/', { replace: true });
  }

  function locateHere() {
    setLocating(true);
    setGeoError(null);
    locate()
      .then((position) => {
        setCurrentPlace({ kind: 'gps', ...position, name: null, region: null });
        navigate('/', { replace: true });
      })
      .catch((failure) => {
        setLocating(false);
        setGeoError(
          failure === 'denied'
            ? 'El navegador no nos deja usar tu ubicación. Habilitá el permiso o buscá el lugar.'
            : 'No pudimos obtener tu ubicación. Buscá el lugar por su nombre.',
        );
      });
  }

  const typing = text.trim().length > 0;
  const waiting = typing && (query !== text.trim() || search.isFetching);
  const results = search.data ?? [];

  return (
    <main className="sheet" id="contenido">
      <header className="sheet-head">
        <h1 className="sheet-title">Buscar lugar</h1>
        <Link className="icon-btn icon-btn--solid" to="/" aria-label="Cerrar">
          <Icon name="close" size={24} strokeWidth={2.4} />
        </Link>
      </header>

      <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
        <Icon name="search" size={24} strokeWidth={2.4} />
        <input
          className="search-input"
          type="search"
          aria-label="Buscar localidad o paraje"
          placeholder="Localidad o paraje"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="search"
          // The sheet exists to type into: focus lands here when it opens.
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </form>

      <button
        type="button"
        className="btn btn--light btn--block"
        onClick={locateHere}
        disabled={locating}
        aria-busy={locating || undefined}
      >
        <Icon name="navigation" strokeWidth={2.2} />
        {locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
      </button>
      {geoError ? (
        <p className="sheet-note" role="alert">
          <Icon name="alertCircle" size={20} />
          {geoError}
        </p>
      ) : null}

      <div className="sheet-body" aria-live="polite">
        {!typing ? (
          saved.length || unsaved.length ? (
            <>
              {saved.length ? (
                <PlaceSection id="sec-saved" title="Guardados" places={saved} saved onPick={pick} />
              ) : null}
              {unsaved.length ? (
                <PlaceSection
                  id="sec-recent"
                  title="Recientes"
                  places={unsaved}
                  saved={false}
                  onPick={pick}
                />
              ) : null}
            </>
          ) : (
            <p className="sheet-hint">
              Escribí el nombre de un pueblo, ciudad o paraje de la Argentina.
            </p>
          )
        ) : search.isError && !waiting ? (
          <p className="sheet-note" role="alert">
            <Icon name="alertCircle" size={20} />
            {search.error.message}
          </p>
        ) : results.length ? (
          <ul className="place-list" aria-label="Resultados">
            {results.map((place) => (
              <li key={`${place.lat},${place.lon}`}>
                <PlaceButton place={place} onPick={pick} icon="pin" />
              </li>
            ))}
          </ul>
        ) : waiting || query.length < 2 ? (
          <p className="sheet-hint">Buscando…</p>
        ) : letters(query) < 5 ? (
          <p className="sheet-hint">Seguí escribiendo…</p>
        ) : (
          <p className="sheet-hint">
            No encontramos ese lugar en la Argentina. Probá con otro nombre.
          </p>
        )}
      </div>

      <footer className="sheet-credits">
        <p>{CREDITS}</p>
      </footer>
    </main>
  );
}
