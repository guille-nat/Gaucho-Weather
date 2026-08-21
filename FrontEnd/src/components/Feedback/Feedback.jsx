import { useEffect } from "react"
import PropTypes from "prop-types"
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react"
import "./style/Feedback.css"

// Tiempo antes de auto-cerrar un aviso de éxito. Los errores nunca se
// auto-cierran: el usuario necesita tiempo para leerlos y actuar.
const AUTO_DISMISS_MS = 4000

const ICONS = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
}

// Reemplazo accesible y no bloqueante de alert()/window.confirm en todo el
// flujo de autenticación y perfil. role="alert" para errores (interrumpe al
// lector de pantalla), role="status" para el resto (anuncio educado).
export default function Feedback({ type = "info", message, onDismiss, autoDismiss }) {
    const shouldAutoDismiss = autoDismiss ?? type === "success"

    useEffect(() => {
        if (!shouldAutoDismiss || !onDismiss) return undefined
        const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldAutoDismiss, message])

    if (!message) return null

    const isError = type === "error"
    const Icon = ICONS[type] ?? Info

    return (
        <div
            className={`feedback feedback--${type}`}
            role={isError ? "alert" : "status"}
            aria-live={isError ? "assertive" : "polite"}
        >
            <Icon size={20} aria-hidden="true" className="feedback-icon" />
            <p className="feedback-message">{message}</p>
            {onDismiss && (
                <button type="button" className="feedback-close" onClick={onDismiss} aria-label="Cerrar aviso">
                    <X size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    )
}

Feedback.propTypes = {
    type: PropTypes.oneOf(["success", "error", "info", "warning"]),
    message: PropTypes.string,
    onDismiss: PropTypes.func,
    autoDismiss: PropTypes.bool,
}
