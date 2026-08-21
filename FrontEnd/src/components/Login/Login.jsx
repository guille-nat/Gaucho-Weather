import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { login } from '../../redux/slices/authSlice';
import {setPreferences} from '../../redux/slices/userPreferencesSlice';
import { userLogin } from '../../services/auth.service';
import {getUserProfile} from '../../services/userProfileServices'
import { PublicRoutes } from "../../routes/routes";
import { Navigate, useNavigate } from 'react-router-dom';
import AuthErrorLogin from '../AuthErrorLogin'
import Feedback from '../Feedback';
import GauchoLogo from '../../../public/icons/logo_app/GauchoWeather-redondo.ico';
import '../../styles/Auth-Register.css';

const Login = () => {
    const [redirectToHome, setRedirectToHome] = useState(false);
    const [showError, setShowError] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    // Fallback para cualquier falla que no sea 401 (timeout, 500, sin
    // conexión): en el campo la señal es irregular, así que tocar "Ingresar"
    // siempre tiene que dar alguna respuesta visible, nunca quedar mudo.
    const [feedback, setFeedback] = useState(null)
    // Funciones para manejar la autenticación
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleLogin = async (credentials) => {
        setShowError(false);
        setFeedback(null);
        setIsLoading(true);
        try {
            const data = await userLogin(credentials.username, credentials.password);
            // Despachamos la acción login para guardar en Redux
            dispatch(login({
                token: data.access,
                refreshToken: data.refresh,
            }));
            const data_profile = await getUserProfile();
            dispatch(setPreferences({
                favoriteLocation: data_profile.preferences.favorite_location,
                preferredUnits: data_profile.preferences.preferred_units,
                alertsEnabled: data_profile.preferences.alerts_enabled,
            }))
            setRedirectToHome(true);
        } catch (error) {
            if (error.status === 401) {
                setShowError(true);
            } else {
                console.error(error);
                setFeedback({
                    type: 'error',
                    message: 'No pudimos iniciar sesión. Revisá tu conexión e intentá de nuevo.',
                });
            }
        } finally {
            setIsLoading(false);
        }

    };

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword)
    }

    if (redirectToHome) {
        return <Navigate replace to={PublicRoutes.HOME} />;
    };


    return (
        <>
            <div className="auth-wrapper">
                <div className="auth-container">
                    <div className="auth-card">
                        <div className="auth-content">
                            <div className="auth-header">
                                <img src={GauchoLogo} alt="Gaucho Weather" className="brand-logo" />
                                <h1>Bienvenido de vuelta</h1>
                                <p>Ingresá tus credenciales para acceder a tu cuenta</p>
                            </div>

                            <form className="auth-form" onSubmit={(e) => {
                                e.preventDefault();
                                handleLogin({
                                    username: e.target.username.value.toLowerCase(),
                                    password: e.target.password.value
                                });
                            }}>
                                {showError && <AuthErrorLogin visible={true} onDismiss={() => setShowError(false)} />}
                                {feedback && (
                                    <Feedback
                                        type={feedback.type}
                                        message={feedback.message}
                                        autoDismiss={false}
                                        onDismiss={() => setFeedback(null)}
                                    />
                                )}
                                <div className="form-group">
                                    <input
                                        type="username"
                                        id="username"
                                        name="username"
                                        placeholder=" "
                                        required
                                    />
                                    <label htmlFor="username">Nombre de Usuario</label>

                                </div>

                                <div className="form-group">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        id="password"
                                        name="password"
                                        placeholder=" "
                                        required
                                    />
                                    <label htmlFor="password">Contraseña</label>
                                    <button type="button" className="toggle-password" onClick={togglePasswordVisibility}>
                                        {showPassword ? "Ocultar" : "Mostrar"}
                                    </button>

                                </div>

                                <div className="form-options">
                                    <label className="checkbox-container">
                                        <input type="checkbox" />
                                        <span className="checkmark"></span>
                                        <span>Recordarme</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => navigate(PublicRoutes.FORGOT_PASSWORD)}
                                        className="forgot-link"
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                </div>

                                <button type="submit" className={`submit-button ${isLoading ? "loading" : ""}`} disabled={isLoading}>
                                    <span className="button-text">Ingresar</span>
                                    <span className="spinner"></span>
                                </button>
                                <button type="button" onClick={() => navigate(`${PublicRoutes.HOME}`)} className={`submit-button cancel ${isLoading ? "loading" : ""}`} disabled={isLoading}>
                                    <span className="button-text">Cancelar</span>
                                    <span className="spinner"></span>
                                </button>
                            </form>

                            <div className="auth-footer">
                                <p>
                                    ¿No tienes cuenta?{" "}
                                    <button onClick={() => {
                                        navigate(`${PublicRoutes.REGISTER}`)
                                    }}
                                        className="switch-link">
                                        Regístrate
                                    </button>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Login
