import { createSlice } from "@reduxjs/toolkit";

// Claves de localStorage. Se centralizan acá para que el slice sea el único
// lugar que las conoce.
const STORAGE_KEYS = {
    location: "location-search",
    latitude: "latitude-search",
    longitude: "longitude-search",
};

function readFromStorage() {
    return {
        location: window.localStorage.getItem(STORAGE_KEYS.location),
        latitude: window.localStorage.getItem(STORAGE_KEYS.latitude),
        longitude: window.localStorage.getItem(STORAGE_KEYS.longitude),
    };
}

// Se hidrata desde localStorage para que la última búsqueda sobreviva a un
// refresco de la página.
const initialState = readFromStorage();

const searchLocationSlice = createSlice({
    name: "searchLocation",
    initialState,
    reducers: {
        setSearchLocation: (state, action) => {
            const { location, latitude, longitude } = action.payload;
            state.location = location;
            // Se guardan como texto: es lo que espera la API y lo único que
            // localStorage admite.
            state.latitude = String(latitude);
            state.longitude = String(longitude);

            window.localStorage.setItem(STORAGE_KEYS.location, location);
            window.localStorage.setItem(STORAGE_KEYS.latitude, String(latitude));
            window.localStorage.setItem(STORAGE_KEYS.longitude, String(longitude));
        },
        clearSearchLocation: (state) => {
            state.location = null;
            state.latitude = null;
            state.longitude = null;

            Object.values(STORAGE_KEYS).forEach((key) =>
                window.localStorage.removeItem(key)
            );
        },
    },
});

export const { setSearchLocation, clearSearchLocation } =
    searchLocationSlice.actions;
export default searchLocationSlice.reducer;
