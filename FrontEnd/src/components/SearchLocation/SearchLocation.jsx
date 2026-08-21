import { useJsApiLoader, Autocomplete } from '@react-google-maps/api'
import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import { setSearchLocation } from '../../redux/slices/searchLocationSlice';
import './style/SearchLocation.css';

const libraries = ["places"];

const SearchLocation = () => {
    const autocompleteRef = useRef(null);
    const [inputValue, setInputValue] = useState("");
    const [error, setError] = useState("");
    const dispatch = useDispatch();

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        libraries
    })

    function formatLocationForQuery(location) {
        return location
            .toLowerCase()
            .replace(/,/g, '')            // eliminar comas
            .replace(/\bprovince\b/g, '') // eliminar la palabra "province"
            .replace(/\s+/g, '+')         // reemplazar espacios por +
            .trim();                      // eliminar espacios extras al principio o final
    }

    const onPlaceChanged = () => {
        if (!autocompleteRef.current) return;

        const place = autocompleteRef.current.getPlace();

        // Si el usuario escribe y aprieta Enter sin elegir una sugerencia,
        // Google devuelve un place sin geometry.
        if (!place?.geometry?.location || !place.formatted_address) {
            setError("Elegí una ubicación de la lista de sugerencias.");
            return;
        }

        setError("");
        setInputValue(place.formatted_address);

        // lat() y lng() son funciones del objeto LatLng de Google.
        dispatch(setSearchLocation({
            location: formatLocationForQuery(place.formatted_address),
            latitude: place.geometry.location.lat(),
            longitude: place.geometry.location.lng(),
        }));
    };

    if (loadError) {
        return (
            <p className="search-location-error" role="alert">
                No se pudo cargar el buscador de ubicaciones.
            </p>
        );
    }

    return (
        <div>
            {isLoaded &&
                <Autocomplete
                    onLoad={(ref) => (autocompleteRef.current = ref)}
                    onPlaceChanged={onPlaceChanged}
                >
                    <div className='container-search-location'>
                        <label htmlFor="search-location" className="sr-only">
                            Buscar ubicación
                        </label>
                        <input
                            id="search-location"
                            type="text"
                            className='input-search-location'
                            placeholder='Escriba su ubicación...'
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            aria-describedby={error ? "search-location-error" : undefined}
                        />
                        <svg fill="currentColor" width="20px" height="20px" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                            <path d="M790.588 1468.235c-373.722 0-677.647-303.924-677.647-677.647 0-373.722 303.925-677.647 677.647-677.647 373.723 0 677.647 303.925 677.647 677.647 0 373.723-303.924 677.647-677.647 677.647Zm596.781-160.715c120.396-138.692 193.807-319.285 193.807-516.932C1581.176 354.748 1226.428 0 790.588 0S0 354.748 0 790.588s354.748 790.588 790.588 790.588c197.647 0 378.24-73.411 516.932-193.807l516.028 516.142 79.963-79.963-516.142-516.028Z" fillRule="evenodd"></path>
                        </svg>
                    </div>
                </Autocomplete>
            }

            {error && (
                <p id="search-location-error" className="search-location-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
};

export default SearchLocation
