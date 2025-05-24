import { useState } from "react"
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
        <div className="auth-error">
            <div className="auth-error-icon">⚠️</div>
            <div className="auth-error-content">
                <h4 className="auth-error-title">Error de autenticación</h4>
                <p className="auth-error-message">{message}</p>
            </div>
            <button className="auth-error-close" onClick={handleDismiss}>
                ×
            </button>
        </div>
    )
}
