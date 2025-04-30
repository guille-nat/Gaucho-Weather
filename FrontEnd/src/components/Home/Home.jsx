import { useState, useEffect } from "react";
import { format, set } from "date-fns";
import { es, tr } from "date-fns/locale";
import {
    ChevronDown,
    ChevronUp,
} from "lucide-react"
import { weatherService } from "../../services/weatherService";
import { getUserProfile } from "../../services/userProfileServices";
import { setPreferences } from "../../redux/slices/userPreferencesSlice";
import { useSelector, useDispatch } from "react-redux";
import weatherCodeData from "../../data/weather_code_data.json";
import { getUserLocation } from "../../utilities/locationService";
import WeatherDetails from "../WeatherDetails";
import WeatherMainInfo from "../WeatherMainInfo";
import CitySelector from "../CitySelector";
import {
    formatTemp,
    formatSize,
    formatDistance,
} from "../../utilities/convertUnits";
import "../../styles/Main.css";

// import pruebaWeatherNow from '../../data/prueba_weather_now.json';
// import pruebaWeatherForecast from '../../data/prueba_weather_forecast.json';

const Home = () => {
    // Obtener isLoggedIn
    const isLoggedIn = useSelector((store) => store.auth.isLoggedIn);

    const units = useSelector((state) => state.userPreferences.preferredUnits);
    const dispatch = useDispatch();
    const [currentWeather, setCurrentWeather] = useState(null);
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [location, setLocation] = useState("");
    const [userData, setUserData] = useState(null);

    // Estados para la interactividad
    const [expandedSection, setExpandedSection] = useState(null)
    const [selectedForecastDay, setSelectedForecastDay] = useState(null);
    const [showDetailedInfo, setShowDetailedInfo] = useState(false);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [tempUnit, setTempUnit] = useState(units);
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
        const fetchWeatherData = async () => {
            try {
                // Obtener localización actual del usuario.
                if (selectedLocation == null) {
                    const { latitude, longitude } = await getUserLocation();

                    const [current, forecast] = await Promise.all([
                        weatherService.getCurrentWeather({ location, latitude, longitude }),
                        weatherService.getForecast({ location, latitude, longitude }),
                    ]);
                    setCurrentWeather(current);
                    setForecastData(forecast);
                }
                else {
                    const { latitude, longitude } = ""
                    const [current, forecast] = await Promise.all([
                        weatherService.getCurrentWeather({ location, latitude, longitude }),
                        weatherService.getForecast({ location, latitude, longitude }),
                    ]);
                    setCurrentWeather(current);
                    setForecastData(forecast);
                };
                setError(null);
            } catch (err) {
                setError("Error al cargar los datos del clima");
                console.error("Error fetching weather data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchWeatherData();
        const interval = setInterval(fetchWeatherData, 30 * 60 * 1000); // Actualizar cada 30 minutos

        return () => clearInterval(interval);
    }, [location, isLoggedIn, tempUnit]);
    useEffect(() => {
        const setDataUser = async () => {
            try {
                if (isLoggedIn) {
                    const data_profile = await getUserProfile();
                    dispatch(setPreferences({
                        favoriteLocation: data_profile.preferences.favorite_location,
                        preferredUnits: data_profile.preferences.preferred_units,
                        alertsEnabled: data_profile.preferences.alerts_enabled,
                    }))
                }
            }
            catch (err) {
                setError("Error al cargar los datos del clima");
                console.error("Error fetching weather data:", err);
            }
        }
        setDataUser()
    }, []);
    const toggleSection = (section) => {
        if (expandedSection === section) {
            setExpandedSection(null)
        } else {
            setExpandedSection(section)
        }
    }
     // Update current time every minute
     useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date())
        }, 60000)

        return () => clearInterval(timer)
    }, [])
    // Función para formatear la ubicación
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
        setLocation(locationName);
        return locationName;
    };
    // Get appropriate weather background class
    const getWeatherBackground = () => {
        if (!currentWeather) return "weather-clear"

        const hour = currentTime.getHours()
        const isNight = hour < 6 || hour > 19
        const weatherCode = currentWeather.data.values.weatherCode

        if (weatherCode >= 4000) {
            return "weather-rainy"
        } else if (weatherCode >= 1001) {
            return isNight ? "weather-cloudy-night" : "weather-cloudy"
        } else {
            return isNight ? "weather-clear-night" : "weather-clear"
        }
    }


    // Función para obtener el nivel de preocupación UV
    const getUVConcernText = (level) => {
        const concerns = ["Bajo", "Moderado", "Alto", "Muy Alto", "Extremo"];
        return concerns[Math.min(level, 4)];
    };
    // Función para alternar la visualización de información detallada
    const toggleDetailedInfo = () => {
        setShowDetailedInfo(!showDetailedInfo);
    };

    // Función para obtener recomendaciones para el campo basadas en las condiciones
    const getRecomendaciones = () => {
        const { values } = currentWeather.data;
        const recomendaciones = [];

        // Recomendaciones basadas en temperatura
        if (values.temperature > 30) {
            recomendaciones.push("Riego recomendado en horas tempranas o tardías.");
        }

        // Recomendaciones basadas en probabilidad de lluvia
        if (values.precipitationProbability > 50) {
            recomendaciones.push(
                "Posponer aplicación de agroquímicos por posibles lluvias."
            );
        } else if (values.precipitationProbability < 20 && values.humidity < 60) {
            recomendaciones.push(
                "Condiciones óptimas para aplicación de agroquímicos."
            );
        }

        // Recomendaciones basadas en viento
        if (values.windSpeed > 15) {
            recomendaciones.push("Evitar pulverizaciones por vientos fuertes.");
        } else if (values.windSpeed < 5) {
            recomendaciones.push("Condiciones favorables para pulverización.");
        }

        // Recomendaciones basadas en humedad
        if (values.humidity > 80) {
            recomendaciones.push(
                "Vigilar cultivos por posible desarrollo de hongos."
            );
        }

        // Si no hay recomendaciones específicas
        if (recomendaciones.length === 0) {
            recomendaciones.push(
                "Condiciones generales favorables para labores agrícolas."
            );
        }

        return recomendaciones;
    };

    // Función para cambiar la ubicación
    const handleLocationChange = (location) => {
        setSelectedLocation(location);
        setShowLocationModal(false);
        // Aquí iría la lógica para actualizar el clima según la nueva ubicación
    };
    const handleForecastDayClick = (index) => {
        setSelectedForecastDay(selectedForecastDay === index ? null : index);
    };

    // Manejo de carga de datos climáticos
    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Cargando datos del clima...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="error-container">
                <p>{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="retry-button"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    if (!currentWeather || !forecastData) {
        return null;
    }

    return (
        <div className={`home-container ${getWeatherBackground()}`}>
            <section className="weather-main">
                <CitySelector />
                <WeatherMainInfo
                    currentWeather={currentWeather}
                    forecastData={forecastData}
                    weatherCodeData={weatherCodeData}
                    tempUnit={tempUnit}
                    setTempUnit={setTempUnit}
                />
            </section>

            <section className="campo-info">
                <div className="campo-header" onClick={() => toggleSection("info")}>
                    <h2 className="campo-title">Información para el Campo</h2>
                    <p className="campo-description">
                        Datos complementarios sobre el campo
                    </p>
                    {expandedSection === "info" ? (
                        <ChevronUp className="toggle-icon" />
                    ) : (
                        <ChevronDown className="toggle-icon" />
                    )}
                </div>
                {expandedSection === "info" && (
                    <div className="campo-grid">
                        <div className="campo-card conditions">
                            <h3>Condiciones Actuales</h3>
                            <div className="campo-details">
                                <div className="campo-detail-item">
                                    <div className="detail-header">
                                        <span className="detail-icon">🌧️</span>
                                        <span className="detail-title">Precipitación</span>
                                    </div>
                                    <div className="detail-content">
                                        <span className="detail-value">
                                            {
                                                forecastData.weather_daily_data[0].values
                                                    .precipitationProbabilityAvg
                                            }
                                            %
                                        </span>
                                        <span className="detail-description">Probabilidad</span>
                                    </div>
                                </div>
                                {forecastData.weather_daily_data[0].values.hailProbabilityAvg ? (
                                    <>
                                        <div className="campo-detail-item">
                                            <div className="detail-header">
                                                <span className="detail-icon">❄️</span>
                                                <span className="detail-title">Granizo</span>
                                            </div>
                                            <div className="detail-content">
                                                <span className="detail-value">
                                                    {
                                                        forecastData.weather_daily_data[0].values
                                                            .hailProbabilityAvg
                                                    }
                                                    %
                                                </span>
                                                <span className="detail-description">Probabilidad</span>
                                            </div>
                                        </div>
                                        <div className="campo-detail-item">
                                            <div className="detail-header">
                                                <span className="detail-icon">📏</span>
                                                <span className="detail-title">Tamaño Granizo</span>
                                            </div>
                                            <div className="detail-content">
                                                <span className="detail-value">
                                                    {formatSize(
                                                        forecastData.weather_daily_data[0].values.hailSizeAvg,
                                                        tempUnit
                                                    )}{" "}
                                                    {tempUnit === "metric" ? "mm" : "in"}
                                                </span>
                                                <span className="detail-description">Diámetro</span>
                                            </div>
                                        </div>
                                    </>
                                ) : null}

                                <div className="campo-detail-item">
                                    <div className="detail-header">
                                        <span className="detail-icon">💧</span>
                                        <span className="detail-title">Punto Rocío</span>
                                    </div>
                                    <div className="detail-content">
                                        <span className="detail-value">
                                            {formatTemp(
                                                forecastData.weather_daily_data[0].values.dewPointAvg,
                                                tempUnit
                                            )}{" "}
                                            °{tempUnit === "metric" ? "C" : "F"}
                                        </span>
                                        <span className="detail-description">Temperatura</span>
                                    </div>
                                </div>
                                <div className="campo-detail-item">
                                    <div className="detail-header">
                                        <span className="detail-icon">👁️</span>
                                        <span className="detail-title">Visibilidad</span>
                                    </div>
                                    <div className="detail-content">
                                        <span className="detail-value">
                                            {formatDistance(
                                                currentWeather.data.values.visibility,
                                                tempUnit
                                            )}{" "}
                                            {tempUnit === "metric" ? " km/h" : " mi"}
                                        </span>
                                        <span className="detail-description">Distancia</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="campo-card recomendaciones">
                            <h3>Recomendaciones</h3>
                            <div className="recomendaciones-list">
                                {getRecomendaciones().map((recomendacion, index) => (
                                    <div key={index} className="recomendacion-item">
                                        <span className="recomendacion-icon">✅</span>
                                        <p>{recomendacion}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="alert-section">
                                <div
                                    className={`alert-indicator ${currentWeather.data.values.hailProbability > 20
                                        ? "warning"
                                        : "safe"
                                        }`}
                                >
                                    <span className="alert-icon">⚠️</span>
                                    <span>
                                        Riesgo de granizo:{" "}
                                        {currentWeather.data.values.hailProbability > 20
                                            ? "Moderado"
                                            : "Bajo"}
                                    </span>
                                </div>
                                <div
                                    className={`alert-indicator ${currentWeather.data.values.uvHealthConcern > 2
                                        ? "warning"
                                        : "safe"
                                        }`}
                                >
                                    <span className="alert-icon">☀️</span>
                                    <span>
                                        Protección UV:{" "}
                                        {getUVConcernText(currentWeather.data.values.uvHealthConcern)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>)}
            </section>

            <section className="weather-detail" >
                <div className="card-header" onClick={() => toggleSection("details")}>
                    <h2 className="card-title">Información Meteorológica Detallada</h2>
                    <p className="card-description">Datos complementarios sobre las condiciones actuales</p>
                    {expandedSection === "details" ? (
                        <ChevronUp className="toggle-icon" />
                    ) : (
                        <ChevronDown className="toggle-icon" />
                    )}
                </div>

                {expandedSection === "details" && (
                    <WeatherDetails
                        currentWeather={currentWeather}
                        forecastData={forecastData}
                        tempUnit={tempUnit}
                    />)}
            </section>
        </div>
    );
};

export default Home;
