import { useState, useEffect, lazy, Suspense } from "react"
import PropTypes from "prop-types"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { formatTemp, formatSpeed } from "../../utilities/convertUnits"
import { WEATHER_ICON_SLUGS } from "../../data/weatherIconSlugs";
import {
    Sunrise,
    Sunset,
    Thermometer,
    MapPin,
    Droplets,
    Wind,
} from "lucide-react"
import "./style/WeatherMainInfo.css"

// @react-google-maps/api (usado por SearchLocation) es el bloque más pesado
// del bundle de entrada; se saca del chunk inicial y se carga recién cuando
// este componente se monta. El fallback de Suspense reserva el mismo alto
// que el input real (ver .search-location-skeleton en SearchLocation.css)
// para no producir salto de layout mientras carga.
const SearchLocation = lazy(() => import("../SearchLocation"));

const SearchLocationSkeleton = () => (
    <div className="search-location-skeleton skeleton" aria-hidden="true" />
);

export default function WeatherMainInfo({ currentWeather, forecastData, weatherCodeData, tempUnit, setTempUnit, setLocation, weatherBackground }) {
    const [activeTab, setActiveTab] = useState("daily")
    // Extract current weather data
    const current = currentWeather.data.values

    // Extract hourly forecast (next 24 hours)
    const hourlyForecast = forecastData.weather_hourly_data.filter((item, index) => index < 24)

    // Extract daily forecast
    const dailyForecast = forecastData.weather_daily_data
    // Get weather condition from code
    const getWeatherCondition = (weatherCode) => {
        if (!weatherCodeData || !weatherCodeData.weatherCode) {
            console.error("Datos de weatherCodeData no disponibles.");
            return "Despejado";
        }
    
        return weatherCodeData.weatherCode[weatherCode] || "Despejado";
    };
    // Función para obtener el icono según el código del clima.
    // El nombre de archivo se arma con WEATHER_ICON_SLUGS (siempre en inglés,
    // ver ese archivo), nunca con el texto traducido de weatherCodeData: así
    // traducir la condición al español no rompe la ruta del ícono.
    const getWeatherIcon = (weatherCode) => {
        const iconSlug = WEATHER_ICON_SLUGS[weatherCode];

        if (iconSlug) {
            const now = new Date();
            const hours = now.getHours();
            const sunriseTime = formatTime(dailyForecast[0].values.sunriseTime).split(':')
            const sunsetTime = formatTime(dailyForecast[0].values.sunsetTime).split(':')
            // Corregido el error en la condición compuesta
            if (weatherCode >= 1102 || weatherCode === 1001) {
                return `/icons/weather_code/${iconSlug}.svg`;
            } if (
                (weatherCode === 1000 ||
                    weatherCode === 1100 ||
                    weatherCode === 1101) &&
                hours >= sunsetTime[0]|| (hours >= 0 && hours <=sunriseTime[0])
            ) {
                return `/icons/weather_code/${iconSlug}_night.svg`;
            } else {
                return `/icons/weather_code/${iconSlug}_day.svg`;
            }
        }

        return `/icons/weather_code/1000_clear_small@2x.png`; // Default icon
    };

    // El selector de unidad es un div interactivo: mismo patrón de
    // accesibilidad que los encabezados de acordeón de Home.jsx (role,
    // tabIndex, aria-label, Enter/Space), adaptado a un toggle en vez de un
    // disclosure (por eso aria-label describe la acción, no aria-expanded).
    const toggleTempUnit = () => setTempUnit(tempUnit === "metric" ? "imperial" : "metric")
    const handleTempToggleKeyDown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            toggleTempUnit()
        }
    }

    // weatherBackground llega como prop: antes este componente tenía su
    // propio reloj (setInterval) y su propia copia de getWeatherBackground(),
    // duplicados byte a byte con los de Home.jsx. Home ya tiene el reloj que
    // gobierna el fondo del home-container; ahora es la única fuente de
    // verdad y este componente solo consume el resultado.

    // Format date for display
    const formatDate = (dateString) => {
        try {
            const date = new Date(dateString)
            return format(date, "EEEE, d 'de' MMMM", { locale: es })
        } catch {
            return "Fecha desconocida"
        }
    }

    // Format time for display
    const formatTime = (dateString) => {
        try {
            const date = new Date(dateString)
            return format(date, "HH:mm", { locale: es })
        } catch {
            return "--:--"
        }
    }

    // Format day for display
    const formatDay = (dateString) => {
        try {
            const date = new Date(dateString)
            return format(date, "EEE", { locale: es })
        } catch {
            return "---"
        }
    }

    // Format day number for display
    const formatDayNumber = (dateString) => {
        try {
            const date = new Date(dateString)
            return format(date, "d", { locale: es })
        } catch {
            return "--"
        }
    }


    // Función PURA para formatear la ubicación: solo calcula, no toca estado
    // de nadie. Antes llamaba a setLocation() (estado del padre, Home) acá
    // adentro, durante el render de este componente — "Cannot update a
    // component while rendering a different component". El efecto que
    // propaga el nombre corto a Home vive aparte, más abajo.
    const formatLocation = (locationName) => {
        if (!locationName) return "";
        const parts = locationName.split(",");
        if (parts.length >= 3) {
            // Buscamos la parte que contiene el nombre de la localidad
            // Típicamente después del código postal
            for (let i = 0; i < parts.length; i++) {
                // Si encontramos un código postal (formato S2520CYI o similar)
                if (parts[i].trim().match(/S\d{7}/)) {
                    // Tomamos las partes restantes que deberían ser localidad, provincia, país
                    return parts
                        .slice(i + 1)
                        .join(",")
                        .trim();
                }
            }
            // Si no encontramos un código postal, intentamos otra estrategia
            // Asumimos que las últimas 3 partes son localidad, provincia, país
            return parts
                .slice(Math.max(0, parts.length - 3))
                .join(",")
                .trim();
        }
        return locationName;
    };

    const locationName = currentWeather.location.name;
    const displayLocation = formatLocation(locationName);

    // Cuando el nombre no trae la estructura de 3+ partes (código postal +
    // localidad + provincia + país), se propaga tal cual al estado
    // `location` de Home — después del render, no durante.
    useEffect(() => {
        if (!locationName) return;
        const parts = locationName.split(",");
        if (parts.length < 3) {
            setLocation(locationName);
        }
    }, [locationName, setLocation]);

    return (
        <div className={`weather-container ${weatherBackground}`}>
            <div className="container-search-location">
                <Suspense fallback={<SearchLocationSkeleton />}>
                    <SearchLocation />
                </Suspense>
            </div>
            <div className={`weather-card-main ${weatherBackground}`}>
                {/* Header with current weather */}
                <div className="weather-header">
                    <div className="location-info">
                        <div className="location">
                            <MapPin size={18} />
                            <h1>{displayLocation}</h1>
                        </div>
                        <p className="date">{formatDate(currentWeather.data.time)}</p>
                    </div>

                    <div
                        className="temp-toggle"
                        role="button"
                        tabIndex={0}
                        aria-label={tempUnit === "metric" ? "Cambiar a grados Fahrenheit" : "Cambiar a grados Celsius"}
                        onClick={toggleTempUnit}
                        onKeyDown={handleTempToggleKeyDown}
                    >
                        <span className={tempUnit === "metric" ? "active" : ""}>°C</span>
                        <span className="divider">|</span>
                        <span className={tempUnit === "imperial" ? "active" : ""}>°F</span>
                    </div>
                </div>

                {/* Current weather display */}

                <div className={`current-weather ${weatherBackground}`}>
                    <div className="temp-display">
                        <span className="current-temp">{formatTemp(current.temperatureApparent,tempUnit)}{tempUnit === "metric" ? ' °C' : ' °F'}</span>
                        <img
                            src={getWeatherIcon(current.weatherCode)}
                            alt={getWeatherCondition(current.weatherCode)}
                            className="weather-icon-main"
                        />
                        <span className="condition">{getWeatherCondition(current.weatherCode)}</span>
                    </div>

                    <div className="weather-details">
                        <div className="detail-item">
                            <Thermometer size={16} />
                            <span>Sensación: {formatTemp(current.temperatureApparent,tempUnit)} °</span>
                        </div>
                        <div className="detail-item">
                            <Droplets size={16} />
                            <span>Humedad: {current.humidity}%</span>
                        </div>
                        <div className="detail-item">
                            <Wind size={16} />
                            <span>Viento: {formatSpeed(current.windSpeed,tempUnit)} {tempUnit === "metric" ? ' km/h' : ' mph'}</span>
                        </div>
                        {dailyForecast[0] && (
                            <>
                                <div className="detail-item">
                                    <Sunrise size={16} />
                                    <span>{formatTime(dailyForecast[0].values.sunriseTime)}</span>
                                </div>
                                <div className="detail-item">
                                    <Sunset size={16} />
                                    <span>{formatTime(dailyForecast[0].values.sunsetTime)}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Tabs for hourly/daily forecast */}
                <div className="forecast-tabs">
                    <button className={`tab ${activeTab === "hourly" ? "active" : ""}`} onClick={() => setActiveTab("hourly")}>
                        Por Horas
                    </button>
                    <button className={`tab ${activeTab === "daily" ? "active" : ""}`} onClick={() => setActiveTab("daily")}>
                        Próximos 6 Días
                    </button>
                </div>

                {/* Forecast content */}
                <div className="forecast-content">
                    {activeTab === "hourly" && (
                        <div className="hourly-forecast">
                            {hourlyForecast.map((hour, index) => {
                                const icon = getWeatherIcon(hour.values.weatherCode)
                                return (
                                    <div key={index} className="forecast-item">
                                        <p className="time">{formatTime(hour.time)}</p>
                                        <div className="icon-container">

                                            <img
                                                src={icon}
                                                alt={getWeatherCondition(hour.values.weatherCode)}
                                                className="weather-icon"
                                                loading="lazy"
                                            />
                                        </div>
                                        <p className="temp">{formatTemp(hour.values.temperature,tempUnit)}°</p>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {activeTab === "daily" && (
                        <div
                            className="daily-forecast"
                            tabIndex={0}
                            aria-label="Pronóstico de los próximos 6 días, desplazable"
                        >
                            {dailyForecast.map((day, index) => {
                                const icon = getWeatherIcon(day.values.weatherCodeMin)
                                return (
                                    <div key={index} className="forecast-item">
                                        <p className="day">{index === 0 ? "Hoy" : formatDay(day.time)}</p>
                                        <p className="date">{formatDayNumber(day.time)}</p>
                                        <div className="icon-container">
                                            <img
                                                src={icon}
                                                alt={getWeatherCondition(day.values.weatherCodeMin)}
                                                className="weather-icon"
                                                loading="lazy"
                                            />
                                        </div>
                                        <div className="temp-range">
                                            <span className="high">{formatTemp(day.values.temperatureMax,tempUnit)}°</span>
                                            <div className="vertical-line"></div>
                                            <span className="low">{formatTemp(day.values.temperatureMin,tempUnit)}°</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

WeatherMainInfo.propTypes = {
    currentWeather: PropTypes.shape({
        location: PropTypes.shape({
            name: PropTypes.string,
        }).isRequired,
        data: PropTypes.shape({
            time: PropTypes.string,
            values: PropTypes.shape({
                temperatureApparent: PropTypes.number,
                weatherCode: PropTypes.number,
                humidity: PropTypes.number,
                windSpeed: PropTypes.number,
            }).isRequired,
        }).isRequired,
    }).isRequired,
    forecastData: PropTypes.shape({
        weather_hourly_data: PropTypes.arrayOf(
            PropTypes.shape({
                time: PropTypes.string,
                values: PropTypes.shape({
                    weatherCode: PropTypes.number,
                    temperature: PropTypes.number,
                }),
            })
        ).isRequired,
        weather_daily_data: PropTypes.arrayOf(
            PropTypes.shape({
                time: PropTypes.string,
                values: PropTypes.shape({
                    sunriseTime: PropTypes.string,
                    sunsetTime: PropTypes.string,
                    temperatureMax: PropTypes.number,
                    temperatureMin: PropTypes.number,
                    weatherCodeMin: PropTypes.number,
                }),
            })
        ).isRequired,
    }).isRequired,
    weatherCodeData: PropTypes.shape({
        weatherCode: PropTypes.objectOf(PropTypes.string),
    }).isRequired,
    tempUnit: PropTypes.string.isRequired,
    setTempUnit: PropTypes.func.isRequired,
    setLocation: PropTypes.func.isRequired,
    weatherBackground: PropTypes.string.isRequired,
}

