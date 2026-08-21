import { useState } from "react"
import PropTypes from "prop-types"
import { AlertTriangle, X } from "lucide-react"
import "./style/AuthErrorLogin.css"

export default function AuthError({
    visible = false,
    message = "Usuario o contraseña incorrectos. Por favor, inténtalo de nuevo.",
    onDismiss,
}) {
    const [isVisible, setIsVisible] = useState(visible)

    if (!isVisible) return null

    const handleDismiss = () => {
        setIsVisible(false)
        if (onDismiss) onDismiss()
    }

    return (
        <div className="auth-error" role="alert">
            <AlertTriangle className="auth-error-icon" aria-hidden="true" />
            <div className="auth-error-content">
                <h4 className="auth-error-title">Error de autenticación</h4>
                <p className="auth-error-message">{message}</p>
            </div>
            <button className="auth-error-close" onClick={handleDismiss} aria-label="Cerrar aviso">
                <X aria-hidden="true" />
            </button>
        </div>
    )
}

AuthError.propTypes = {
    visible: PropTypes.bool,
    message: PropTypes.string,
    onDismiss: PropTypes.func,
}
