import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { CircleCheck, Thermometer, CloudRain, Droplets } from "lucide-react";
import { weatherService } from "../../services/weatherService";
import { getUserLocation } from "../../utilities/locationService";
import { DEFAULT_LOCATION } from "../../constants/constants";
import { formatTemp, formatSize } from "../../utilities/convertUnits";
import "./style/Reports.css";

const Reports = () => {
    const [weeklyData, setWeeklyData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState("current");
    const [currentCoords, setCurrentCoords] = useState(null);

    const userPreferences = useSelector((state) => state.userPreferences);
    const favoriteLocation = userPreferences?.favoriteLocation || [];
    //Todo
    const units = userPreferences?.preferredUnits || 'metric';

    useEffect(() => {
        const fetchLocation = async () => {
            try {
                const { latitude, longitude } = await getUserLocation();
                setCurrentCoords({ latitude, longitude });
            } catch (geoError) {
                // Misma política que Home: sin geolocalización caemos a la
                // ubicación por defecto. Antes esto dejaba loading clavado en
                // true para siempre porque currentCoords nunca se resolvía.
                console.warn(
                    "Geolocalización no disponible, usando ubicación por defecto:",
                    geoError.message
                );
                setCurrentCoords({ ...DEFAULT_LOCATION });
            }
        };

        fetchLocation();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                let forecast;

                // El backend siempre devuelve métrico (ver weatherService); la
                // conversión a la unidad preferida del usuario se hace acá
                // abajo, al mostrar los valores, no al pedirlos.
                if (selectedLocation === "current" && currentCoords) {
                    forecast = await weatherService.getForecast({
                        latitude: currentCoords.latitude,
                        longitude: currentCoords.longitude,
                    });
                } else if (selectedLocation !== "current") {
                    const loc = favoriteLocation.find((loc) => loc.name === selectedLocation);
                    forecast = await weatherService.getForecast({
                        latitude: loc.lat,
                        longitude: loc.lon,
                    });
                }

                const analysis = analyzeForecast(forecast.weather_daily_data);
                setWeeklyData(analysis);
                setLoading(false);
            } catch {
                setError("Error al cargar el informe semanal");
                setLoading(false);
            }
        };

        if ((selectedLocation === "current" && currentCoords) || selectedLocation !== "current") {
            fetchData();
        }
    }, [selectedLocation, currentCoords, favoriteLocation]);

    const analyzeForecast = (data) => {
        if (!data || data.length === 0) return null;

        
        const tempMax = Math.max(...data.map((d) => d.values.temperatureMax));
        const tempMin = Math.min(...data.map((d) => d.values.temperatureMin));
        const lluviaTotal = data.reduce((acc, d) => acc + (d.values.rainAccumulationSum || 0), 0);
        const diasLluvia = data.filter((d) => d.values.precipitationProbabilityAvg > 50).length;
        const humedadProm = Math.round(data.reduce((acc, d) => acc + (d.values.humidityAvg || 0), 0) / data.length);
        const evapotranspiracion = data.reduce((acc, d) => acc + (d.values.evapotranspirationSum || 0), 0);

        const recomendaciones = [];
        if (diasLluvia > 3) {
            recomendaciones.push("Evitar riego adicional, se esperan varias lluvias.");
        } else if (lluviaTotal < 5) {
            recomendaciones.push("Posible necesidad de riego suplementario.");
        }

        if (humedadProm > 80) {
            recomendaciones.push("Alta humedad, monitorear hongos en cultivos.");
        }

        if (tempMax > 30) {
            recomendaciones.push("Temperaturas altas, considerar protección para cultivos sensibles.");
        }

        recomendaciones.push("Ideal para monitoreo de: maíz, trigo, soja, sorgo, girasol.");

        return {
            tempMax,
            tempMin,
            lluviaTotal,
            diasLluvia,
            humedadProm,
            evapotranspiracion,
            recomendaciones,
            units,
        };
    };

    const unitTemp = units === "metric" ? "°C" : "°F";
    const unitRain = units === "metric" ? "mm" : "inch";

    return (
        <div className="reports-container">
            <h1>Informe Semanal</h1>

            {favoriteLocation?.length > 0 && (
                <div className="location-selector">
                    <select onChange={(e) => setSelectedLocation(e.target.value)} value={selectedLocation}>
                        <option value="current">Ubicación actual</option>
                        {favoriteLocation.map((loc, index) => (
                            <option key={index} value={loc.name}>{loc.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {loading ? (
                <p className="loading">Cargando informe...</p>
            ) : error ? (
                <p className="error">{error}</p>
            ) : weeklyData ? (
                <div className="report-section">
                    {/* La decisión primero (PRODUCT.md, principio 1): las
                        recomendaciones son la conclusión del informe y
                        lideran la pantalla. Las 6 métricas crudas que las
                        justifican quedan como resumen compacto más abajo,
                        agrupadas por tema en vez de repetidas como tarjetas
                        idénticas. */}
                    <section className="report-recommendations" aria-labelledby="recommendations-heading">
                        <h2 id="recommendations-heading">Qué hacer esta semana</h2>
                        <ul className="recommendations-list">
                            {weeklyData.recomendaciones.map((rec, index) => (
                                <li key={index} className="recommendation-item">
                                    <CircleCheck className="recommendation-icon" aria-hidden="true" />
                                    <p>{rec}</p>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="report-summary" aria-labelledby="summary-heading">
                        <h2 id="summary-heading">Resumen de la semana</h2>
                        <div className="summary-groups">
                            <div className="summary-group">
                                <h3 className="summary-group-title">
                                    <Thermometer aria-hidden="true" />
                                    Temperatura
                                </h3>
                                <dl className="summary-rows">
                                    <div className="summary-row">
                                        <dt>Máxima</dt>
                                        <dd>{formatTemp(weeklyData.tempMax, units)}{unitTemp}</dd>
                                    </div>
                                    <div className="summary-row">
                                        <dt>Mínima</dt>
                                        <dd>{formatTemp(weeklyData.tempMin, units)}{unitTemp}</dd>
                                    </div>
                                </dl>
                            </div>

                            <div className="summary-group">
                                <h3 className="summary-group-title">
                                    <CloudRain aria-hidden="true" />
                                    Lluvia
                                </h3>
                                <dl className="summary-rows">
                                    <div className="summary-row">
                                        <dt>Acumulada (7 días)</dt>
                                        <dd>{formatSize(weeklyData.lluviaTotal, units)} {unitRain}</dd>
                                    </div>
                                    <div className="summary-row">
                                        <dt>Días con alta probabilidad</dt>
                                        <dd>{weeklyData.diasLluvia}</dd>
                                    </div>
                                </dl>
                            </div>

                            <div className="summary-group">
                                <h3 className="summary-group-title">
                                    <Droplets aria-hidden="true" />
                                    Suelo y humedad
                                </h3>
                                <dl className="summary-rows">
                                    <div className="summary-row">
                                        <dt>Humedad relativa promedio</dt>
                                        <dd>{weeklyData.humedadProm}%</dd>
                                    </div>
                                    <div className="summary-row">
                                        <dt>Evapotranspiración (7 días)</dt>
                                        <dd>{weeklyData.evapotranspiracion.toFixed(2)} mm</dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    </section>
                </div>
            ) : (
                <p>No hay datos disponibles.</p>
            )}
        </div>
    );
};

export default Reports;
