import { useState, useEffect } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
    Sunrise,
    Sunset,
    Thermometer,
    MapPin,
    Droplets,
    Wind,
} from "lucide-react"
import "./style/WeatherMainInfo.css"
import { formatTemp, formatSpeed } from "../../utilities/convertUnits"


export default function WeatherMainInfo({ currentWeather, forecastData, weatherCodeData, tempUnit, setTempUnit }) {
    const [activeTab, setActiveTab] = useState("daily")
    const [currentTime, setCurrentTime] = useState(new Date())
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
    //TODO
    // Función para convertir grados a dirección del viento
    const getWindDirection = (degrees) => {
        const directions = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
        const index = Math.round(degrees / 45) % 8;
        return directions[index];
    };
    
    // Función para obtener el icono según el código del clima
    const getWeatherIcon = (weatherCode) => {
        const conditionName = weatherCodeData.weatherCode[weatherCode];

        if (conditionName) {
            const formattedConditionName = conditionName
                .toLowerCase()
                .replace(/\s+/g, "_");
            const now = new Date();
            const hours = now.getHours();
            const sunriseTime = formatTime(dailyForecast[0].values.sunriseTime).split(':')
            const sunsetTime = formatTime(dailyForecast[0].values.sunsetTime).split(':')
            // Corregido el error en la condición compuesta
            if (weatherCode >= 1102 || weatherCode === 1001) {
                return `/icons/weather_code/${formattedConditionName}.svg`;
            } if (
                (weatherCode === 1000 ||
                    weatherCode === 1100 ||
                    weatherCode === 1101) &&
                hours >= sunsetTime[0]|| (hours >= 0 && hours <=sunriseTime[0])
            ) {
                return `/icons/weather_code/${formattedConditionName}_night.svg`;
            } else {
                return `/icons/weather_code/${formattedConditionName}_day.svg`;
            }
        }

        return `/icons/weather_code/1000_clear_small@2x.png`; // Default icon
    };

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

    // Format date for display
    const formatDate = (dateString) => {
        try {
            const date = new Date(dateString)
            return format(date, "EEEE, d 'de' MMMM", { locale: es })
        } catch (error) {
            return "Fecha desconocida"
        }
    }

    // Format time for display
    const formatTime = (dateString) => {
        try {
            const date = new Date(dateString)
            return format(date, "HH:mm", { locale: es })
        } catch (error) {
            return "--:--"
        }
    }

    // Format day for display
    const formatDay = (dateString) => {
        try {
            const date = new Date(dateString)
            return format(date, "EEE", { locale: es })
        } catch (error) {
            return "---"
        }
    }

    // Format day number for display
    const formatDayNumber = (dateString) => {
        try {
            const date = new Date(dateString)
            return format(date, "d", { locale: es })
        } catch (error) {
            return "--"
        }
    }


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

    
    
    
   
    
    return (
        <div className={`weather-container ${getWeatherBackground()}`}>

            <div className={`weather-card-main ${getWeatherBackground()}`}>
                {/* Header with current weather */}
                <div className="weather-header">
                    <div className="location-info">
                        <div className="location">
                            <MapPin size={18} />
                            <h1>{formatLocation(currentWeather.location.name)}</h1>
                        </div>
                        <p className="date">{formatDate(currentWeather.data.time)}</p>
                    </div>

                    <div className="temp-toggle" onClick={() => setTempUnit(tempUnit === "metric" ? "imperial" : "metric")}>
                        <span className={tempUnit === "metric" ? "active" : ""}>°C</span>
                        <span className="divider">|</span>
                        <span className={tempUnit === "imperial" ? "active" : ""}>°F</span>
                    </div>
                </div>

                {/* Current weather display */}
                
                <div className={`current-weather ${getWeatherBackground()}`}>
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
                        Próximos 5 Días
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
                                            />
                                        </div>
                                        <p className="temp">{formatTemp(hour.values.temperature,tempUnit)}°</p>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {activeTab === "daily" && (
                        <div className="daily-forecast">
                            {dailyForecast.map((day, index) => {
                                const icon = getWeatherIcon(day.values.weatherCodeMin)
                                return (
                                    <div key={index} className="forecast-item">
                                        <p className="day">{index == 0 ? "hoy":formatDay(day.time) }</p>
                                        <p className="date">{formatDayNumber(day.time)}</p>
                                        
                                        <div className="icon-container">
                                            <img
                                                src={icon}
                                                alt={getWeatherCondition(day.values.weatherCodeMin)}
                                                className="weather-icon"
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

