import { useState } from "react";
import { Cloud, Droplets, Sun, Wind } from "lucide-react";
import { formatPressure, formatSpeed, formatDistance,formatTemp} from "../../utilities/convertUnits";
import "./style/WeatherDetails.css";

export default function WeatherDetails({
    currentWeather, forecastData, tempUnit
}) {
    const [activeTab, setActiveTab] = useState("humidity")

    return (
        <div className="weather-card">
<<<<<<< HEAD
            <div className="card-header">
                <h2 className="card-title">Información Meteorológica Detallada</h2>
                <p className="card-description">Datos complementarios sobre las condiciones actuales</p>
            </div>
=======
            
>>>>>>> 4957e5227bf302910829f85454d42ff1f85d815b
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

function MetricCard({ title, value }) {
    return (
        <div className="metric-card">
            <h3 className="metric-card-title">{title}</h3>
            <p className="metric-card-value">{value}</p>
        </div>
    )
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

