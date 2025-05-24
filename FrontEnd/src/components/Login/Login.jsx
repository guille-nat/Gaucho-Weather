import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { login } from '../../redux/slices/authSlice';
import {setPreferences} from '../../redux/slices/userPreferencesSlice';
import { userLogin } from '../../services/auth.service';
import {getUserProfile} from '../../services/userProfileServices'
import { PublicRoutes } from "../../routes/routes";
import { Navigate, useNavigate } from 'react-router-dom';
import AuthErrorLogin from '../AuthErrorLogin'
import '../../styles/Auth-Register.css';

const Login = () => {
    const [redirectToHome, setRedirectToHome] = useState(false);
    const [showError, setShowError] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    // Funciones para manejar la autenticación
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleLogin = async (credentials) => {
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
            }
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
                                <div className="brand-logo"></div>
                                <h1>Welcome back</h1>
                                <p>Enter your credentials to access your account</p>
                            </div>

                            <form className="auth-form" onSubmit={(e) => {
                                e.preventDefault();
                                handleLogin({
                                    username: e.target.username.value.toLowerCase(),
                                    password: e.target.password.value
                                });
                            }}>
                                {showError && <AuthErrorLogin visible={true} onDismiss={() => setShowError(false)} />}
                                <div className="form-group">
                                    <input
                                        type="username"
                                        id="username"
                                        name="username"
                                        required
                                    />
                                    <label htmlFor="email">Nombre de Usuario</label>

                                </div>

                                <div className="form-group">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        id="password"
                                        name="password"
                                        required
                                    />
                                    <label htmlFor="password">Password</label>
                                    <button type="button" className="toggle-password" onClick={togglePasswordVisibility}>
                                        {showPassword ? "Hide" : "Show"}
                                    </button>

                                </div>

                                <div className="form-options">
                                    <label className="checkbox-container">
                                        <input type="checkbox" />
                                        <span className="checkmark"></span>
                                        <span>Remember me</span>
                                    </label>
                                    <a href="#" className="forgot-link">
                                        Forgot password?
                                    </a>
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

                            <div className="auth-divider">
                                <span>or continue with</span>
                            </div>

                            <div className="social-auth">
                                <button className="social-button">
                                    <span className="social-icon">
                                        <svg width="40" height="40" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid"><path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4" /><path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853" /><path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05" /><path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335" /></svg>
                                    </span>
                                </button>
                                <button className="social-button">
                                    <span className="social-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="url(#a)" height="40" width="40"><defs><linearGradient x1="50%" x2="50%" y1="97.078%" y2="0%" id="a"><stop offset="0%" stopColor="#0062E0" /><stop offset="100%" stopColor="#19AFFF" /></linearGradient></defs><path d="M15 35.8C6.5 34.3 0 26.9 0 18 0 8.1 8.1 0 18 0s18 8.1 18 18c0 8.9-6.5 16.3-15 17.8l-1-.8h-4l-1 .8z" /><path fill="#FFF" d="m25 23 .8-5H21v-3.5c0-1.4.5-2.5 2.7-2.5H26V7.4c-1.3-.2-2.7-.4-4-.4-4.1 0-7 2.5-7 7v4h-4.5v5H15v12.7c1 .2 2 .3 3 .3s2-.1 3-.3V23h4z" /></svg>
                                    </span>
                                </button>
                                <button className="social-button">
                                    <span className="social-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" space="preserve" width="40" height="40" viewBox="0 0 814 1000"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" /></svg>
                                    </span>
                                </button>
                            </div>

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

                        <div className="auth-decoration">
                            <div className="decoration-circle circle-1"></div>
                            <div className="decoration-circle circle-2"></div>
                            <div className="decoration-circle circle-3"></div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Login
