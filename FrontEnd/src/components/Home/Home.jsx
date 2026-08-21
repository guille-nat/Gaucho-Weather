import { useState, useEffect, useMemo } from "react";
import {
    ChevronDown,
    ChevronUp,
    CloudRain,
    CloudHail,
    Ruler,
    Droplets,
    Eye,
    Sprout,
    CircleCheck,
    AlertTriangle,
    Sun,
} from "lucide-react"
import { weatherService } from "../../services/weatherService";
import { getUserProfile } from "../../services/userProfileServices";
import { setPreferences } from "../../redux/slices/userPreferencesSlice";
import { useSelector, useDispatch } from "react-redux";
import WeatherMainInfo from "../WeatherMainInfo";
import WeatherDetails from "../WeatherDetails";
import FrostRiskCard from "../FrostRiskCard";
import weatherCodeData from "../../data/weather_code_data.json";
import { getUserLocation } from "../../utilities/locationService";
import { DEFAULT_LOCATION } from "../../constants/constants";
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
    // Riesgo de helada de hoy (days[0] del endpoint frost-risk). Se maneja
    // aparte de currentWeather/forecastData: si esta llamada falla, la
    // tarjeta se degrada sola y no debe tumbar el resto del Home.
    const [frostRiskToday, setFrostRiskToday] = useState(null);
    const [frostRiskLoading, setFrostRiskLoading] = useState(true);
    // nombre de la localidad que se esta mostrando en pantalla
    const [location, setLocation] = useState("");
    // Ubicación que busca el usuario. Viene de Redux: antes se leía de
    // localStorage una sola vez al montar, así que elegir algo en el buscador
    // no cambiaba nada hasta recargar la página entera.
    const localizationSearch = useSelector((state) => state.searchLocation);

    // Estados para la interactividad
    // Arranca colapsado (PRODUCT.md, principio 4: "simple por defecto,
    // profundo a pedido"). Antes arrancaba abierto en "info" porque los
    // datos de campo eran el contenido principal de la pantalla; con la
    // tarjeta de riesgo de helada como primera respuesta, esa ya es la
    // vista simple por defecto y el detalle pasa a estar a un toque.
    const [expandedSection, setExpandedSection] = useState(null)
    const [tempUnit, setTempUnit] = useState(units || 'metric');
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
        // El riesgo de helada se pide en el mismo Promise.all que el resto,
        // pero con su propio .catch: así una falla de este endpoint no hace
        // rechazar el Promise.all completo ni tumba currentWeather/forecast.
        const fetchFrostRisk = ({ location, latitude, longitude }) =>
            weatherService
                .getFrostRisk({ location, latitude, longitude })
                .catch((frostErr) => {
                    console.error("Error al obtener el riesgo de helada:", frostErr.message);
                    return null;
                });

        const fetchWeatherData = async () => {
            setFrostRiskLoading(true);
            try {
                // Obtener localización actual del usuario.
                if (localizationSearch.location && localizationSearch.latitude && localizationSearch.longitude) {

                    const location = localizationSearch.location
                    const latitude = localizationSearch.latitude
                    const longitude = localizationSearch.longitude

                    const [current, forecast, frostRisk] = await Promise.all([
                        weatherService.getCurrentWeather({ location, latitude, longitude }),
                        weatherService.getForecast({ location, latitude, longitude }),
                        fetchFrostRisk({ location, latitude, longitude }),
                    ]);
                    setCurrentWeather(current);
                    setForecastData(forecast);
                    setFrostRiskToday(frostRisk?.days?.[0] ?? null);
                }else{
                    let latitude, longitude;
                    try {
                        ({ latitude, longitude } = await getUserLocation());
                    } catch (geoError) {
                        // Geolocalización denegada o con timeout: caemos a la
                        // ubicación por defecto en vez de morir en un error.
                        console.warn(
                            "Geolocalización no disponible, usando ubicación por defecto:",
                            geoError.message
                        );
                        ({ latitude, longitude } = DEFAULT_LOCATION);
                    }

                    const [current, forecast, frostRisk] = await Promise.all([
                        weatherService.getCurrentWeather({ location, latitude, longitude }),
                        weatherService.getForecast({ location, latitude, longitude }),
                        fetchFrostRisk({ location, latitude, longitude }),
                    ]);
                    setCurrentWeather(current);
                    setForecastData(forecast);
                    setFrostRiskToday(frostRisk?.days?.[0] ?? null);
                }
                setError(null);
            } catch (err) {
                setError("Error al cargar los datos del clima");
                console.error("Error fetching weather data:", err);
            } finally {
                setLoading(false);
                setFrostRiskLoading(false);
            }
        };

        fetchWeatherData();
        const interval = setInterval(fetchWeatherData, 30 * 60 * 1000); // Actualizar cada 30 minutos

        return () => clearInterval(interval);
        // tempUnit NO va acá: el backend siempre se pide en métrico (ver
        // weatherService), así que cambiar °C/°F es puro re-render de lo ya
        // cargado, nunca un refetch.
    }, [location, isLoggedIn, localizationSearch]);

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
                setError("No pudimos cargar tus preferencias.");
                console.error("Error fetching user profile:", err);
            }
        }
        setDataUser()
        // Depende de isLoggedIn: al iniciar sesión hay que traer las
        // preferencias, no solo en el primer montado del componente.
    }, [isLoggedIn, dispatch]);
    const toggleSection = (section) => {
        if (expandedSection === section) {
            setExpandedSection(null)
        } else {
            setExpandedSection(section)
        }
    }
    // Los encabezados del acordeón son la única forma de llegar al detalle
    // ahora que arranca colapsado: deben poder abrirse con teclado, no solo
    // con click/touch.
    const handleHeaderKeyDown = (section) => (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            toggleSection(section)
        }
    }
     // Update current time every minute
     useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date())
        }, 60000)

        return () => clearInterval(timer)
    }, [])

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
    // Recomendaciones para el campo basadas en las condiciones actuales.
    // Memoizado: antes era una función normal que el JSX llamaba en cada
    // render (Home re-renderiza cada minuto por el reloj de fondo), sin
    // depender de nada que cambiara con esa frecuencia.
    const recomendaciones = useMemo(() => {
        if (!currentWeather) return [];
        const { values } = currentWeather.data;
        const result = [];

        // Recomendaciones basadas en temperatura
        if (values.temperature > 30) {
            result.push("Riego recomendado en horas tempranas o tardías.");
        }

        // Recomendaciones basadas en probabilidad de lluvia
        if (values.precipitationProbability > 50) {
            result.push(
                "Posponer aplicación de agroquímicos por posibles lluvias."
            );
        } else if (values.precipitationProbability < 20 && values.humidity < 60) {
            result.push(
                "Condiciones óptimas para aplicación de agroquímicos."
            );
        }

        // Recomendaciones basadas en viento
        if (values.windSpeed > 15) {
            result.push("Evitar pulverizaciones por vientos fuertes.");
        } else if (values.windSpeed < 5) {
            result.push("Condiciones favorables para pulverización.");
        }

        // Recomendaciones basadas en humedad
        if (values.humidity > 80) {
            result.push(
                "Vigilar cultivos por posible desarrollo de hongos."
            );
        }

        // Si no hay recomendaciones específicas
        if (result.length === 0) {
            result.push(
                "Condiciones generales favorables para labores agrícolas."
            );
        }

        return result;
    }, [currentWeather]);

    // Lectura en lenguaje llano del punto de rocío: qué tan cerca está el
    // aire de saturarse es lo que determina si hay rocío o niebla al
    // amanecer. Lectura cualitativa y genérica, sin inventar agronomía.
    const getDewPointReading = (temperature, dewPoint) => {
        if (typeof temperature !== "number" || typeof dewPoint !== "number") return null;
        const spread = temperature - dewPoint;
        if (spread <= 2) {
            return "Aire casi saturado: probable rocío o niebla al amanecer.";
        }
        if (spread <= 5) {
            return "Humedad alta: puede formarse rocío en superficies frías.";
        }
        return "Aire seco: rocío poco probable.";
    };

    // Lectura en lenguaje llano de la evapotranspiración: cuánta agua pierde
    // el suelo y el cultivo por día, que es lo que orienta si conviene regar.
    const getEvapotranspirationReading = (etSum) => {
        if (typeof etSum !== "number") return null;
        if (etSum < 3) {
            return "Pérdida de agua del suelo baja: el riego puede esperar.";
        }
        if (etSum < 6) {
            return "Pérdida de agua del suelo moderada: controlá la humedad del suelo.";
        }
        return "Pérdida de agua del suelo alta: el cultivo puede necesitar riego pronto.";
    };

    // Manejo de carga de datos climáticos: skeleton del hero + tarjeta de
    // helada (registro del producto: skeletons, no spinners) en vez de un
    // spinner genérico que no anticipa qué va a aparecer.
    if (loading) {
        return (
            <div className="home-container">
                <section className="weather-main">
                    <FrostRiskCard data={null} loading={true} tempUnit={tempUnit} />
                    <div className="hero-skeleton" aria-busy="true" aria-live="polite">
                        <div className="hero-skeleton-top">
                            <span className="skeleton hero-skeleton-pin" />
                            <span className="skeleton hero-skeleton-location" />
                        </div>
                        <div className="hero-skeleton-main">
                            <span className="skeleton hero-skeleton-temp" />
                            <span className="skeleton hero-skeleton-icon" />
                        </div>
                        <span className="skeleton hero-skeleton-condition" />
                        <span className="sr-only">Cargando datos del clima…</span>
                    </div>
                </section>
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

    // Calculado una sola vez por render y pasado como prop a WeatherMainInfo:
    // antes ambos componentes tenían su propio setInterval de 60s y su
    // propia copia (idéntica) de esta función.
    const weatherBackground = getWeatherBackground();

    // Estas lecturas se usaban dos veces cada una en el JSX de más abajo (una
    // para el chequeo `&&`, otra para el contenido real): se calculan acá
    // una sola vez.
    const dewPointReading = getDewPointReading(
        forecastData.weather_daily_data[0].values.temperatureMin,
        forecastData.weather_daily_data[0].values.dewPointAvg
    );
    const evapotranspirationReading = getEvapotranspirationReading(
        forecastData.weather_daily_data[0].values.evapotranspirationSum
    );

    return (
        <div className={`home-container ${weatherBackground}`}>
            <section className="weather-main">
                {/* La respuesta primero (PRODUCT.md, principio 1): el
                    veredicto de helada va antes que la temperatura hero, no
                    después del pronóstico de 6 días. */}
                <FrostRiskCard
                    data={frostRiskToday}
                    loading={frostRiskLoading}
                    tempUnit={tempUnit}
                />
                <WeatherMainInfo
                    currentWeather={currentWeather}
                    forecastData={forecastData}
                    weatherCodeData={weatherCodeData}
                    tempUnit={tempUnit}
                    setTempUnit={setTempUnit}
                    setLocation={setLocation}
                    weatherBackground={weatherBackground}
                />
            </section>

            <section className="campo-info">
                <div
                    className="campo-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={expandedSection === "info"}
                    aria-controls="campo-grid-panel"
                    onClick={() => toggleSection("info")}
                    onKeyDown={handleHeaderKeyDown("info")}
                >
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
                    <div className="campo-grid" id="campo-grid-panel">
                        <div className="campo-card conditions">
                            <h3>Condiciones Actuales</h3>
                            <div className="campo-details">
                                <div className="campo-detail-item">
                                    <div className="detail-header">
                                        <CloudRain className="detail-icon" aria-hidden="true" />
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
                                                <CloudHail className="detail-icon" aria-hidden="true" />
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
                                                <Ruler className="detail-icon" aria-hidden="true" />
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
                                        <Droplets className="detail-icon" aria-hidden="true" />
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
                                        {dewPointReading && (
                                            <span className="detail-reading">
                                                {dewPointReading}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="campo-detail-item">
                                    <div className="detail-header">
                                        <Sprout className="detail-icon" aria-hidden="true" />
                                        <span className="detail-title">Evapotranspiración</span>
                                    </div>
                                    <div className="detail-content">
                                        <span className="detail-value">
                                            {formatSize(
                                                forecastData.weather_daily_data[0].values.evapotranspirationSum,
                                                tempUnit
                                            )}{" "}
                                            {tempUnit === "metric" ? "mm" : "in"}
                                        </span>
                                        <span className="detail-description">Pérdida diaria</span>
                                        {evapotranspirationReading && (
                                            <span className="detail-reading">
                                                {evapotranspirationReading}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="campo-detail-item">
                                    <div className="detail-header">
                                        <Eye className="detail-icon" aria-hidden="true" />
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
                                {recomendaciones.map((recomendacion, index) => (
                                    <div key={index} className="recomendacion-item">
                                        <CircleCheck className="recomendacion-icon" aria-hidden="true" />
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
                                    <AlertTriangle className="alert-icon" aria-hidden="true" />
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
                                    <Sun className="alert-icon" aria-hidden="true" />
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
                <div
                    className="card-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={expandedSection === "details"}
                    aria-controls="weather-details-panel"
                    onClick={() => toggleSection("details")}
                    onKeyDown={handleHeaderKeyDown("details")}
                >
                    <h2 className="card-title">Información Meteorológica Detallada</h2>
                    <p className="card-description">Datos complementarios sobre las condiciones actuales</p>
                    {expandedSection === "details" ? (
                        <ChevronUp className="toggle-icon" />
                    ) : (
                        <ChevronDown className="toggle-icon" />
                    )}
                </div>

                {expandedSection === "details" && (
                    <div id="weather-details-panel">
                        <WeatherDetails
                            currentWeather={currentWeather}
                            forecastData={forecastData}
                            tempUnit={tempUnit}
                        />
                    </div>
                )}
            </section>
        </div>
    );
};

export default Home;
