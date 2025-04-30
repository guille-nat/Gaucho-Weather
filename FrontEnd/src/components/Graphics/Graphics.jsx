
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { weatherService } from "../../services/weatherService";
import {
    LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import Select from "react-select";
import { getUserLocation } from "../../utilities/locationService";
import Loader from "../Loader"
import "./style/Graphics.css"
const Graphics = () => {
    const preferences = useSelector((state) => state.userPreferences);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [dailyData, setDailyData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [useCurrentLocation, setUseCurrentLocation] = useState(true);

    const fetchWeather = async (loc) => {
        if (!loc) return;
        setLoading(true);
        try {
            const res = await weatherService.getForecast({
                latitude: loc.lat,
                longitude: loc.lon,
                tempUnit: window.localStorage.getItem("preferredUnits") || "metric",
            });

            const formatted = res.weather_daily_data.map((d) => ({
                date: new Date(d.time).toLocaleDateString(),
                temperature: d.values.temperatureAvg,
                humidity: d.values.humidityAvg,
                wind: d.values.windSpeedAvg || 0,
                cloud: d.values.cloudCoverAvg,
                rain: d.values.precipitationProbabilityAvg || 0,
            }));
            setDailyData(formatted);
        } catch (error) {
            console.error("Error al obtener los datos", error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            if (useCurrentLocation) {
                const { latitude, longitude } = await getUserLocation();
                fetchWeather({ lat: latitude, lon: longitude });
            } else if (selectedLocation) {
                fetchWeather(selectedLocation);
            }
        };
        init();
    }, [selectedLocation, useCurrentLocation]);

    const locationOptions = preferences.favoriteLocation.map((loc) => ({
        value: loc,
        label: loc.name,
    }));

    const handleLocationChange = (option) => {
        setUseCurrentLocation(false);
        setSelectedLocation(option.value);
    };

    return (
        <div className="graphics-container">
            <h2>Gráfico Climático Semanal</h2>

            <div className="location-selector">
                <label className="checkbox-wrapper">
                    <input
                        type="checkbox"
                        checked={useCurrentLocation}
                        onChange={() => setUseCurrentLocation(!useCurrentLocation)}
                    />
                    <div className="checkmark">
                        <svg stroke="currentColor" fill="none" viewBox="0 0 24 24">
                            <path
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                strokeWidth="3"
                                d="M20 6L9 17L4 12"
                            ></path>
                        </svg>
                    </div>
                    <span className="label">Usar mi ubicación actual</span>

                </label>
                {!useCurrentLocation && (
                    <Select
                        styles={customStyles}
                        options={preferences.favoriteLocation.map((loc) => ({
                            value: loc,
                            label: loc.name,
                        }))}
                        onChange={(opt) => setSelectedLocation(opt.value)}
                        placeholder="Elegí una ubicación favorita"
                    />
                )}
            </div>

            {loading ? (
                <Loader />
            ) : (
                <div className="charts-wrapper">
                    <ChartCard title="Temperatura °" dataKey="temperature" data={dailyData} color="#FF9800" unit="°" />
                    <ChartCard title="Humedad %" dataKey="humidity" data={dailyData} color="#1976D2" unit="%" />
                    <ChartCard title="Precipitación %" dataKey="rain" data={dailyData} color="#2E7D32" unit="%" />
                    <ChartCard title="Viento km/h" dataKey="wind" data={dailyData} color="#D32F2F" unit="km/h" />
                    <ChartCard title="Nubosidad %" dataKey="cloud" data={dailyData} color="#8884d8" unit="%" />
                </div>
            )}
        </div>
    );
};
const customStyles = {
    control: (base, state) => ({
        ...base,
        backgroundColor: 'var(--card-color)',
        borderColor: state.isFocused ? 'var(--primary-color)' : '#ccc',
        boxShadow: state.isFocused ? '0 0 0 2px var(--primary-color)' : 'none',
        '&:hover': {
            borderColor: 'var(--primary-color)',
        },
        color: 'var(--text-primary)',
        width:'300px',
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: 'var(--background-color)',
        color: 'var(--text-primary)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--shadow-sm)',
    }),
    singleValue: (base) => ({
        ...base,
        color: 'var(--text-primary)',
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
            ? 'var(--primary-color)'
            : state.isFocused
                ? 'var(--background-color-secondary)'
                : 'transparent',
        color: state.isSelected
            ? 'white'
            : 'var(--text-primary)',
        '&:hover': {
            backgroundColor: 'var(--background-color-secondary)',
        },
    }),
    placeholder: (base) => ({
        ...base,
        color: 'var(--text-secondary)',
    }),
    input: (base) => ({
        ...base,
        color: 'var(--text-primary)',
    }),
};

const ChartCard = ({ title, dataKey, data, color, unit }) => (
    <div className="chart-card">
        <h3>{title}</h3>
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => `${value}${unit}`} />
                <Legend />
                <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} />
            </LineChart>
        </ResponsiveContainer>
    </div>
);
export default Graphics;