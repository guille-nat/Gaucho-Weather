import { useState } from "react";
import PropTypes from "prop-types";
import { Cloud, Droplets, Sun, Wind } from "lucide-react";
import { formatPressure, formatSpeed, formatDistance,formatTemp} from "../../utilities/convertUnits";
import "./style/WeatherDetails.css";

export default function WeatherDetails({
    currentWeather, forecastData, tempUnit
}) {
    const [activeTab, setActiveTab] = useState("humidity")

    return (
        <div className="weather-card">
            {/* El encabezado y su control de plegado los aporta Home.jsx,
                que es quien gobierna el acordeón de esta sección. */}
            <div className="card-content">
                <div className="tabs">
                    <div className="tabs-list">
                        <button
                            className={`tab-trigger ${activeTab === "wind" ? "active" : ""}`}
                            onClick={() => setActiveTab("wind")}
                        >
                            <Wind className="tab-icon" />
                            <span className="tab-text">Viento</span>
                        </button>
                        <button
                            className={`tab-trigger ${activeTab === "visibility" ? "active" : ""}`}
                            onClick={() => setActiveTab("visibility")}
                        >
                            <Cloud className="tab-icon" />
                            <span className="tab-text">Visibilidad</span>
                        </button>
                        <button className={`tab-trigger ${activeTab === "uv" ? "active" : ""}`} onClick={() => setActiveTab("uv")}>
                            <Sun className="tab-icon" />
                            <span className="tab-text">UV</span>
                        </button>
                        <button
                            className={`tab-trigger ${activeTab === "humidity" ? "active" : ""}`}
                            onClick={() => setActiveTab("humidity")}
                        >
                            <Droplets className="tab-icon" />
                            <span className="tab-text">Humedad</span>
                        </button>
                    </div>

                    {activeTab === "wind" && (
                        <div className="tab-content active">
                            <div className="metric-grid">
                                <div className="metric-box">
                                    <h3 className="metric-label">Velocidad Actual del Viento</h3>
                                    <p className="metric-value-large">{formatSpeed(currentWeather.data.values.windSpeed, tempUnit)} {tempUnit === 'metric' ? ' km/h': ' mph'}</p>
                                </div>
                                <div className="metric-box">
                                    <h3 className="metric-label">Ráfagas Actuales de Viento</h3>
                                    <p className="metric-value-large">{formatSpeed(currentWeather.data.values.windGust, tempUnit)} {tempUnit === 'metric' ? ' km/h': ' mph'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "visibility" && (
                        <div className="tab-content active">
                            <div className="metric-grid">
                                <div className="metric-box">
                                    <h3 className="metric-label">Visibilidad</h3>
                                    <p className="metric-value-large">{formatDistance(currentWeather.data.values.visibility, tempUnit)} {tempUnit === 'metric' ? ' km': ' mi'}</p>
                                </div>
                                <div className="metric-box">
                                    <h3 className="metric-label">Base de Nubes</h3>
                                    <p className="metric-value-large">{currentWeather.data.values.cloudBase === null ? 0 : formatDistance(currentWeather.data.values.cloudBase, tempUnit)} {tempUnit === 'metric' ? ' km': ' mi'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "uv" && (
                        <div className="tab-content active">
                            <div className="metric-box">
                                <h3 className="metric-label">Índice UV</h3>
                                <div className="uv-container">
                                    <p className="metric-value-large">{currentWeather.data.values.uvIndex}</p>
                                    <UVIndicator level={currentWeather.data.values.uvIndex} />
                                </div>
                                <p className="uv-description">{getUVDescription(currentWeather.data.values.uvIndex)}</p>
                            </div>
                        </div>
                    )}

                    {activeTab === "humidity" && (
                        <div className="tab-content active">
                            <div className="metric-grid">
                                <div className="metric-box">
                                    <h3 className="metric-label">Humedad</h3>
                                    <p className="metric-value-large">{currentWeather.data.values.humidity} %</p>
                                </div>
                                <div className="metric-box">
                                    <h3 className="metric-label">Punto de rocío</h3>
                                    <p className="metric-value-large">{formatTemp(currentWeather.data.values.dewPoint, tempUnit)} °{tempUnit === 'metric' ? 'C': 'F'}</p>
                                    <p className="metric-reading">
                                        {getDewPointReading(currentWeather.data.values.temperature, currentWeather.data.values.dewPoint)}
                                    </p>
                                </div>
                                <div className="metric-box">
                                    <h3 className="metric-label">Presión</h3>
                                    <p className="metric-value-large">{formatPressure(currentWeather.data.values.pressureSeaLevel, tempUnit)} {tempUnit === 'metric' ? 'hPa': 'inHg'}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="separator"></div>

                <div className="summary-grid">
                    <MetricCard title="Visibilidad" value={formatDistance(currentWeather.data.values.visibility, tempUnit) + `${tempUnit === 'metric' ? ' km/h': ' mph'}`}/>
                    <MetricCard title="Ráfagas Mínimas" value={formatSpeed(forecastData.weather_daily_data[0].values.windGustMin, tempUnit) + `${tempUnit === 'metric' ? ' km/h': ' mph'}`} />
                    <MetricCard title="Vel. Máx. Viento" value={formatSpeed(forecastData.weather_daily_data[0].values.windSpeedMax, tempUnit)+ `${tempUnit === 'metric' ? ' km/h': ' mph'}`} />
                    <MetricCard title="Base de Nubes Promedio" value={formatDistance(forecastData.weather_daily_data[0].values.cloudBaseAvg, tempUnit) + `${tempUnit === 'metric' ? ' km': ' mi'}`} />
                </div>
            </div>
        </div>
    )
}

WeatherDetails.propTypes = {
    currentWeather: PropTypes.shape({
        data: PropTypes.shape({
            values: PropTypes.shape({
                windSpeed: PropTypes.number,
                windGust: PropTypes.number,
                visibility: PropTypes.number,
                cloudBase: PropTypes.number,
                uvIndex: PropTypes.number,
                humidity: PropTypes.number,
                temperature: PropTypes.number,
                dewPoint: PropTypes.number,
                pressureSeaLevel: PropTypes.number,
            }).isRequired,
        }).isRequired,
    }).isRequired,
    forecastData: PropTypes.shape({
        weather_daily_data: PropTypes.arrayOf(
            PropTypes.shape({
                values: PropTypes.shape({
                    windGustMin: PropTypes.number,
                    windSpeedMax: PropTypes.number,
                    cloudBaseAvg: PropTypes.number,
                }),
            })
        ).isRequired,
    }).isRequired,
    tempUnit: PropTypes.string.isRequired,
}

function MetricCard({ title, value }) {
    return (
        <div className="metric-card">
            <h3 className="metric-card-title">{title}</h3>
            <p className="metric-card-value">{value}</p>
        </div>
    )
}

MetricCard.propTypes = {
    title: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
}

function UVIndicator({ level }) {
    let colorClass = "uv-low"

    if (level >= 3 && level < 6) {
        colorClass = "uv-moderate"
    } else if (level >= 6 && level < 8) {
        colorClass = "uv-high"
    } else if (level >= 8) {
        colorClass = "uv-extreme"
    }

    return <div className={`uv-indicator ${colorClass}`}></div>
}

UVIndicator.propTypes = {
    level: PropTypes.number.isRequired,
}

// Traduce el punto de rocío a una lectura de decisión: qué tan cerca está el
// aire de saturarse, que es lo que determina si hay rocío o niebla al
// amanecer. Cualitativa y genérica a propósito, sin inventar agronomía.
function getDewPointReading(temperature, dewPoint) {
    if (typeof temperature !== "number" || typeof dewPoint !== "number") {
        return null;
    }
    const spread = temperature - dewPoint;
    if (spread <= 2) {
        return "Aire casi saturado: probable rocío o niebla al amanecer.";
    }
    if (spread <= 5) {
        return "Humedad alta: puede formarse rocío en superficies frías.";
    }
    return "Aire seco: rocío poco probable.";
}

function getUVDescription(level) {
    if (level < 3) {
        return "Bajo: Poco riesgo de daño por exposición al sol."
    } else if (level < 6) {
        return "Moderado: Riesgo moderado. Use protección solar."
    } else if (level < 8) {
        return "Alto: Alto riesgo. Minimice la exposición entre 10am y 4pm."
    } else if (level < 11) {
        return "Muy alto: Riesgo muy alto. Evite estar al sol durante el mediodía."
    } else {
        return "Extremo: Riesgo extremo. Evite estar al aire libre."
    }
}

