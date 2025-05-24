import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { weatherService } from "../../services/weatherService";
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
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject);
                });
                setCurrentCoords({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            } catch (err) {
                setError("No se pudo obtener la ubicación actual.");
            }
        };

        fetchLocation();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                let forecast;

                if (selectedLocation === "current" && currentCoords) {
                    forecast = await weatherService.getForecast({
                        latitude: currentCoords.latitude,
                        longitude: currentCoords.longitude,
                        unitTemp: window.localStorage.getItem("preferredUnits"),
                    });
                } else if (selectedLocation !== "current") {
                    const loc = favoriteLocation.find((loc) => loc.name === selectedLocation);
                    forecast = await weatherService.getForecast({
                        latitude: loc.lat,
                        longitude: loc.lon,
                        unitTemp: window.localStorage.getItem("preferredUnits"),
                    });
                }

                const analysis = analyzeForecast(forecast.weather_daily_data);
                setWeeklyData(analysis);
                setLoading(false);
            } catch (err) {
                
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
            <h2>Informe Semanal</h2>

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
                <p>Cargando informe...</p>
            ) : error ? (
                <p>{error}</p>
            ) : weeklyData ? (
                <div className="report-section">
                    <div className="report-grid">
                        <div className="report-card">
                            <h3>Temperatura Máx.</h3>
                            <div className="report-item">
                                <strong>{weeklyData.tempMax}{unitTemp}</strong>
                                <span>Durante la semana</span>
                            </div>
                        </div>
                        <div className="report-card">
                            <h3>Temperatura Mín.</h3>
                            <div className="report-item">
                                <strong>{weeklyData.tempMin}{unitTemp}</strong>
                                <span>Durante la semana</span>
                            </div>
                        </div>
                        <div className="report-card">
                            <h3>Lluvia Acumulada</h3>
                            <div className="report-item">
                                <strong>{weeklyData.lluviaTotal.toFixed(1)} {unitRain}</strong>
                                <span>Total en 7 días</span>
                            </div>
                        </div>
                        <div className="report-card">
                            <h3>Días de lluvia</h3>
                            <div className="report-item">
                                <strong>{weeklyData.diasLluvia}</strong>
                                <span>Días con alta probabilidad</span>
                            </div>
                        </div>
                        <div className="report-card">
                            <h3>Humedad Promedio</h3>
                            <div className="report-item">
                                <strong>{weeklyData.humedadProm}%</strong>
                                <span>Humedad relativa</span>
                            </div>
                        </div>
                        <div className="report-card">
                            <h3>Evapotranspiración</h3>
                            <div className="report-item">
                                <strong>{weeklyData.evapotranspiracion.toFixed(2)} mm</strong>
                                <span>En la semana</span>
                            </div>
                        </div>
                    </div>

                    <div className="recommendations">
                        <h3>Recomendaciones</h3>
                        <ul>
                            {weeklyData.recomendaciones.map((rec, index) => (
                                <li key={index}>{rec}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            ) : (
                <p>No hay datos disponibles.</p>
            )}
        </div>
    );
};

export default Reports;
