// Función convertir °C → °F
export const formatTemp = (temperature, unit) => {
    return unit === "metric" 
        ? Math.round(temperature) 
        : Math.round((temperature * 9) / 5 + 32);
};

// Función convertir velocidad km/h → mph
export const formatSpeed = (speed, unit) => {
    return unit === "metric" 
        ? Math.round(speed) 
        : Math.round(speed * 0.621371);
};

// Función convertir mm → pulgadas
export const formatSize = (size, unit) => {
    return unit === "metric" 
        ? Math.round(size) 
        : (size * 0.0393701).toFixed(2);
};

// Función convertir distancia km → millas
export const formatDistance = (distance, unit) => {
    return unit === "metric" 
        ? Math.round(distance) 
        : (distance * 0.621371).toFixed(2);
};

// Función convertir presión atmosférica hPa → inHg
export const formatPressure = (pressure, unit) => {
    return unit === "metric" 
        ? Math.round(pressure) 
        : (pressure * 0.02953).toFixed(2);
};
