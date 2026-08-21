
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useSelector } from "react-redux";
import { weatherService } from "../../services/weatherService";
import {
    LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import Select from "react-select";
import { getUserLocation } from "../../utilities/locationService";
import { formatTemp } from "../../utilities/convertUnits";
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
            // El backend siempre devuelve métrico (ver weatherService); antes
            // esta pantalla era la única que pedía conversión server-side vía
            // `tempUnit`, mientras el resto de la app convertía en el
            // cliente — dos estrategias de unidades distintas conviviendo.
            // Ahora la conversión a la unidad preferida pasa a hacerse acá
            // también, al construir la serie para el gráfico.
            const res = await weatherService.getForecast({
                latitude: loc.lat,
                longitude: loc.lon,
            });

            const unit = window.localStorage.getItem("preferredUnits") || "metric";
            const formatted = res.weather_daily_data.map((d) => ({
                date: new Date(d.time).toLocaleDateString("es-AR"),
                temperature: formatTemp(d.values.temperatureAvg, unit),
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

    return (
        <div className="graphics-container">
            <h1 className="graphics-title">Gráfico Climático Semanal</h1>

            <div className="location-selector">
                <label className="location-checkbox">
                    <input
                        type="checkbox"
                        checked={useCurrentLocation}
                        onChange={() => setUseCurrentLocation(!useCurrentLocation)}
                    />
                    <span>Usar mi ubicación actual</span>
                </label>
                {!useCurrentLocation && (
                    <Select
                        aria-label="Elegí una ubicación favorita"
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
                    <ChartCard title="Temperatura °" dataKey="temperature" data={dailyData} color="var(--fill-orange)" unit="°" />
                    <ChartCard title="Humedad %" dataKey="humidity" data={dailyData} color="var(--brand)" unit="%" />
                    <ChartCard title="Precipitación %" dataKey="rain" data={dailyData} color="var(--chart-green)" unit="%" />
                    {/* --chart-red carga connotación de peligro (ver --risk-danger,
                        --feedback-error): el viento acá es solo una serie más, no
                        una alerta, así que usa un tono neutro en vez de rojo. */}
                    <ChartCard title="Viento km/h" dataKey="wind" data={dailyData} color="var(--neutral-500)" unit="km/h" />
                    <ChartCard title="Nubosidad %" dataKey="cloud" data={dailyData} color="var(--chart-purple)" unit="%" />
                </div>
            )}
        </div>
    );
};
const customStyles = {
    control: (base, state) => ({
        ...base,
        backgroundColor: 'var(--surface-raised)',
        borderColor: state.isFocused ? 'var(--brand)' : 'var(--line-strong)',
        boxShadow: state.isFocused ? '0 0 0 2px var(--brand)' : 'none',
        '&:hover': {
            borderColor: 'var(--brand)',
        },
        color: 'var(--content-primary)',
        width:'300px',
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: 'var(--surface-base)',
        color: 'var(--content-primary)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--elevation-1)',
    }),
    singleValue: (base) => ({
        ...base,
        color: 'var(--content-primary)',
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
            ? 'var(--brand)'
            : state.isFocused
                ? 'var(--surface-accent)'
                : 'transparent',
        color: state.isSelected
            ? 'white'
            : 'var(--content-primary)',
        '&:hover': {
            backgroundColor: 'var(--surface-accent)',
        },
    }),
    placeholder: (base) => ({
        ...base,
        color: 'var(--content-secondary)',
    }),
    input: (base) => ({
        ...base,
        color: 'var(--content-primary)',
    }),
};

const ChartCard = ({ title, dataKey, data, color, unit }) => (
    <div className="chart-card">
        <h2 className="chart-card-title">{title}</h2>
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => `${value}${unit}`} />
                <Legend />
                <Line type="monotone" dataKey={dataKey} name={title} stroke={color} strokeWidth={2} />
            </LineChart>
        </ResponsiveContainer>
    </div>
);

ChartCard.propTypes = {
    title: PropTypes.string.isRequired,
    dataKey: PropTypes.string.isRequired,
    data: PropTypes.arrayOf(PropTypes.object).isRequired,
    color: PropTypes.string.isRequired,
    unit: PropTypes.string.isRequired,
};

export default Graphics;