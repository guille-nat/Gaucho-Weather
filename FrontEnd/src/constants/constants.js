// La URL de la API se inyecta en el build de Vite. Sin la variable, cae al
// backend local: así el desarrollo no necesita configuración previa, pero un
// build de producción sin VITE_API_BASE_URL queda en evidencia enseguida.
export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api";

// Ubicación por defecto cuando la geolocalización falla o el usuario la
// deniega: la app debe mostrar clima igual, no una pantalla de error.
export const DEFAULT_LOCATION = {
    latitude: -32.954,
    longitude: -60.6634, // Rosario, Santa Fe
};
