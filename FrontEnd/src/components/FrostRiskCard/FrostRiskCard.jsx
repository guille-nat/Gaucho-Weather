import PropTypes from "prop-types";
import { Snowflake, ThermometerSnowflake } from "lucide-react";
import { formatTemp } from "../../utilities/convertUnits";
import "./style/FrostRiskCard.css";

// Traduce el nivel de riesgo del backend (calculate_frost_probability /
// frost_risk_level) a la respuesta en lenguaje llano que exige el producto:
// la verdad primero, el dato como respaldo. El "tone" mapea a los tokens de
// riesgo de index.css (--risk-safe/watch/warning/danger).
const FROST_VERDICTS = {
    none: {
        headline: "Sin riesgo de helada esta noche",
        tone: "none",
    },
    low: {
        headline: "Riesgo bajo de helada esta noche",
        tone: "low",
    },
    moderate: {
        headline: "Riesgo moderado de helada: vigilá los cultivos sensibles",
        tone: "moderate",
    },
    high: {
        headline: "Riesgo de helada: protegé los cultivos sensibles",
        tone: "high",
    },
    severe: {
        headline: "Riesgo severo de helada: protegé los cultivos ya",
        tone: "severe",
    },
};

const FALLBACK_VERDICT = FROST_VERDICTS.none;

export default function FrostRiskCard({ data = null, loading, tempUnit }) {
    if (loading) {
        return (
            <div className="frost-card frost-card--loading" aria-busy="true" aria-live="polite">
                <span className="skeleton frost-card-skeleton-tag" />
                <div className="frost-card-row">
                    <span className="skeleton frost-card-skeleton-icon" />
                    <div className="frost-card-text">
                        <span className="skeleton frost-card-skeleton-line frost-card-skeleton-line--wide" />
                        <span className="skeleton frost-card-skeleton-line" />
                    </div>
                </div>
            </div>
        );
    }

    // La llamada falló o todavía no volvió con datos útiles: la tarjeta se
    // degrada a un aviso discreto en vez de romper el resto del Home.
    if (!data) {
        return (
            <div className="frost-card frost-card--error" role="status">
                <Snowflake size={16} aria-hidden="true" className="frost-card-error-icon" />
                <p className="frost-card-error-text">
                    No pudimos calcular el riesgo de helada en este momento.
                </p>
            </div>
        );
    }

    const verdict = FROST_VERDICTS[data.risk_level] || FALLBACK_VERDICT;
    const unitLetter = tempUnit === "metric" ? "C" : "F";
    const probability = Number.isFinite(data.probability) ? Math.round(data.probability) : null;
    const hasTempMin = typeof data.temperature_min === "number";

    return (
        <article className={`frost-card frost-card--${verdict.tone}`}>
            <span className="frost-card-tag">
                <Snowflake size={14} aria-hidden="true" />
                Riesgo de helada
            </span>
            <div className="frost-card-row">
                <div className="frost-card-icon" aria-hidden="true">
                    <ThermometerSnowflake size={28} strokeWidth={2} />
                </div>
                <div className="frost-card-text">
                    <p className="frost-card-verdict">{verdict.headline}</p>
                    <p className="frost-card-detail">
                        {probability !== null && `Probabilidad ${probability}%`}
                        {probability !== null && hasTempMin && " · "}
                        {hasTempMin && `Mínima prevista ${formatTemp(data.temperature_min, tempUnit)}°${unitLetter}`}
                    </p>
                </div>
            </div>
        </article>
    );
}

FrostRiskCard.propTypes = {
    data: PropTypes.shape({
        date: PropTypes.string,
        probability: PropTypes.number,
        risk_level: PropTypes.oneOf(["none", "low", "moderate", "high", "severe"]),
        temperature_min: PropTypes.number,
        dew_point: PropTypes.number,
        humidity: PropTypes.number,
        cloud_cover: PropTypes.number,
    }),
    loading: PropTypes.bool.isRequired,
    tempUnit: PropTypes.string.isRequired,
};
