import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicRoutes } from '../../routes/routes';
import { requestPasswordReset } from '../../services/passwordResetService';
import Feedback from '../Feedback';
import GauchoLogo from '../../../public/icons/logo_app/GauchoWeather-redondo.ico';
import '../../styles/Auth-Register.css';
import './style/ForgotPassword.css';

const EMAIL_PATTERN = /\S+@\S+\.\S+/;

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [fieldError, setFieldError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setEmail(e.target.value);
        if (fieldError) setFieldError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email) {
            setFieldError('Ingresá tu correo electrónico');
            return;
        }
        if (!EMAIL_PATTERN.test(email)) {
            setFieldError('El correo electrónico no es válido');
            return;
        }

        setFieldError('');
        setIsLoading(true);
        try {
            const data = await requestPasswordReset(email);
            // El backend responde siempre 200 exista o no la cuenta, para no
            // filtrar qué correos están registrados.
            setFeedback({
                type: 'success',
                message: data?.detail || 'Si el correo está registrado, te enviamos las instrucciones.',
            });
        } catch (error) {
            const serverEmailError = error.response?.data?.email?.[0];
            setFeedback({
                type: 'error',
                message: serverEmailError || 'No pudimos procesar el pedido. Intentá de nuevo en unos minutos.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const showForm = !feedback || feedback.type === 'error';

    return (
        <div className="auth-wrapper">
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-content">
                        <div className="auth-header">
                            <img src={GauchoLogo} alt="Gaucho Weather" className="brand-logo" />
                            <h1>Recuperar contraseña</h1>
                            <p>Ingresá tu correo y te mandamos instrucciones para restablecerla</p>
                        </div>

                        {feedback && (
                            <Feedback
                                type={feedback.type}
                                message={feedback.message}
                                autoDismiss={false}
                                onDismiss={() => setFeedback(null)}
                            />
                        )}

                        {showForm && (
                            <form className="auth-form" onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={email}
                                        onChange={handleChange}
                                        placeholder=" "
                                        className={fieldError ? 'has-error' : ''}
                                        required
                                    />
                                    <label htmlFor="email">Correo electrónico</label>
                                    {fieldError && <span className="error-text">{fieldError}</span>}
                                </div>

                                <button
                                    type="submit"
                                    className={`submit-button ${isLoading ? 'loading' : ''}`}
                                    disabled={isLoading}
                                >
                                    <span className="button-text">Enviar instrucciones</span>
                                    <span className="spinner"></span>
                                </button>
                            </form>
                        )}

                        <div className="auth-footer">
                            <p>
                                <button type="button" onClick={() => navigate(PublicRoutes.LOGIN)} className="switch-link">
                                    Volver a iniciar sesión
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
