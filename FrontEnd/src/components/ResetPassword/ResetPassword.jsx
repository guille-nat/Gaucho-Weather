import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PublicRoutes } from '../../routes/routes';
import { confirmPasswordReset } from '../../services/passwordResetService';
import Feedback from '../Feedback';
import GauchoLogo from '../../../public/icons/logo_app/GauchoWeather-redondo.ico';
import '../../styles/Auth-Register.css';
import './style/ResetPassword.css';

// Ruta y query params (uid, token) definidos por
// BackEnd/users/emails.py::send_password_reset_email — deben coincidir.
const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const uid = searchParams.get('uid');
    const token = searchParams.get('token');
    const navigate = useNavigate();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);
    // Separado de `feedback`: si el usuario cierra el aviso de éxito, la
    // contraseña ya cambió igual — no tiene que reaparecer el formulario.
    const [succeeded, setSucceeded] = useState(false);

    const linkIncomplete = !uid || !token;

    const clearFieldError = (field) => {
        setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const newErrors = {};
        if (!password) {
            newErrors.password = 'Obligatorio';
        } else if (password.length < 8) {
            newErrors.password = 'Mínimo 8 caracteres';
        }
        if (!confirmPassword) {
            newErrors.confirmPassword = 'Obligatorio';
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = 'Las contraseñas no coinciden';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setErrors({});
        setIsLoading(true);
        try {
            const data = await confirmPasswordReset({ uid, token, newPassword: password });
            setFeedback({ type: 'success', message: data?.detail || 'Tu contraseña fue actualizada.' });
            setSucceeded(true);
        } catch (error) {
            const serverData = error.response?.data;
            if (serverData?.new_password) {
                setErrors({ password: serverData.new_password[0] });
            }
            setFeedback({
                type: 'error',
                message: serverData?.error || 'No pudimos actualizar tu contraseña. El enlace puede haber vencido.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (linkIncomplete) {
        return (
            <div className="auth-wrapper">
                <div className="auth-container">
                    <div className="auth-card">
                        <div className="auth-content">
                            <div className="auth-header">
                                <img src={GauchoLogo} alt="Gaucho Weather" className="brand-logo" />
                                <h1>Enlace inválido</h1>
                            </div>
                            <Feedback
                                type="error"
                                message="Este enlace de recupero es inválido o está incompleto. Pedí uno nuevo."
                                autoDismiss={false}
                            />
                            <div className="auth-footer">
                                <p>
                                    <button
                                        type="button"
                                        onClick={() => navigate(PublicRoutes.FORGOT_PASSWORD)}
                                        className="switch-link"
                                    >
                                        Solicitar nuevo enlace
                                    </button>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-wrapper">
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-content">
                        <div className="auth-header">
                            <img src={GauchoLogo} alt="Gaucho Weather" className="brand-logo" />
                            <h1>Elegí tu nueva contraseña</h1>
                            {!succeeded && <p>Tiene que tener al menos 8 caracteres</p>}
                        </div>

                        {feedback && (
                            <Feedback
                                type={feedback.type}
                                message={feedback.message}
                                autoDismiss={false}
                                onDismiss={() => setFeedback(null)}
                            />
                        )}

                        {succeeded ? (
                            <div className="auth-footer">
                                <p>
                                    <button type="button" onClick={() => navigate(PublicRoutes.LOGIN)} className="switch-link">
                                        Ir a iniciar sesión
                                    </button>
                                </p>
                            </div>
                        ) : (
                            <form className="auth-form" onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <input
                                        type="password"
                                        id="password"
                                        name="password"
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            clearFieldError('password');
                                        }}
                                        placeholder=" "
                                        className={errors.password ? 'has-error' : ''}
                                    />
                                    <label htmlFor="password">Nueva contraseña</label>
                                    {errors.password && <span className="error-text">{errors.password}</span>}
                                </div>

                                <div className="form-group">
                                    <input
                                        type="password"
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        value={confirmPassword}
                                        onChange={(e) => {
                                            setConfirmPassword(e.target.value);
                                            clearFieldError('confirmPassword');
                                        }}
                                        placeholder=" "
                                        className={errors.confirmPassword ? 'has-error' : ''}
                                    />
                                    <label htmlFor="confirmPassword">Confirmar contraseña</label>
                                    {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                                </div>

                                <button
                                    type="submit"
                                    className={`submit-button ${isLoading ? 'loading' : ''}`}
                                    disabled={isLoading}
                                >
                                    <span className="button-text">Actualizar contraseña</span>
                                    <span className="spinner"></span>
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
