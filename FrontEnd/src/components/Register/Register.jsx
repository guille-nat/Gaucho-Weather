import { useState } from 'react';
import { PublicRoutes } from "../../routes/routes";
import { useDispatch } from 'react-redux';
import { Navigate, useNavigate } from 'react-router-dom';
import { registerUser } from '../../services/registerService';
import { userLogin } from '../../services/auth.service';
import { login } from '../../redux/slices/authSlice';
import GauchoLogo from '../../../public/icons/logo_app/GauchoWeather-redondo.ico';

import '../../styles/Auth-Register.css';

const Register = () => {
    const [formData, setFormData] = useState({
        first_name: "",
        last_name: "",
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
    })
    const [errors, setErrors] = useState({})
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [redirectToHome, setRedirectToHome] = useState(false);
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData({
            ...formData,
            [name]: value,
        })

        if (errors[name]) {
            setErrors({
                ...errors,
                [name]: "",
            })
        }
    }

    const validateForm = () => {
        const newErrors = {}

        if (!formData.first_name) {
            newErrors.first_name = "Obligatorio"
        }

        if (!formData.last_name) {
            newErrors.last_name = "Obligatorio"
        }

        if (!formData.username) {
            newErrors.username = "Obligatorio"
        }

        if (!formData.email) {
            newErrors.email = "Obligatorio"
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = "Correo electrónico inválido"
        }

        if (!formData.password) {
            newErrors.password = "Obligatorio"
        } else if (formData.password.length < 8) {
            newErrors.password = "Mínimo 8 caracteres"
        }

        if (!formData.confirmPassword) {
            newErrors.confirmPassword = "Obligatorio"
        } else if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = "Las contraseñas no coinciden"
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (validateForm()) {
            setIsLoading(true)
            try {
                const registerData = await registerUser(formData.email, formData.username, formData.password, formData.first_name, formData.last_name);

                if (registerData.status === 201) {
                    // Usar formData en lugar de credentials
                    const loginData = await userLogin(formData.username, formData.password);

                    // Despachamos la acción login para guardar en Redux
                    dispatch(login({
                        user: loginData.user,
                        token: loginData.access,
                        refreshToken: loginData.refresh,
                    }));

                    setRedirectToHome(true);
                } else {
                    // Manejar error de registro
                    console.error("Error en el registro:", registerData);
                    if (registerData.data && registerData.data.errors) {
                        setErrors(registerData.data.errors);
                    }
                }
            } catch (error) {
                console.error("Error:", error);
            } finally {
                setIsLoading(false);
            }
        }
    }

    const togglePasswordVisibility = (field) => {
        if (field === "password") {
            setShowPassword(!showPassword)
        } else {
            setShowConfirmPassword(!showConfirmPassword)
        }
    }

    if (redirectToHome) {
        return <Navigate replace to={PublicRoutes.HOME} />;
    };

    return (
        <div className="auth-wrapper">
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-content">
                        <div className="auth-header">
                            <img src={GauchoLogo} alt="Gaucho Weather" className="brand-logo" />
                            <h1>Crear cuenta</h1>
                            <p>Completá tus datos para empezar</p>
                        </div>

                        <form className="auth-form" onSubmit={handleSubmit}>
                            <div className="form-group">
                                <input
                                    type="text"
                                    id="first_name"
                                    name="first_name"
                                    value={formData.first_name}
                                    onChange={handleChange}
                                    placeholder=" "
                                    className={errors.first_name ? "has-error" : ""}
                                />
                                <label htmlFor="first_name">Nombre</label>
                                {errors.first_name && <span className="error-text">{errors.first_name}</span>}
                            </div>
                            <div className="form-group">
                                <input
                                    type="text"
                                    id="last_name"
                                    name="last_name"
                                    value={formData.last_name}
                                    onChange={handleChange}
                                    placeholder=" "
                                    className={errors.last_name ? "has-error" : ""}
                                />
                                <label htmlFor="last_name">Apellido</label>
                                {errors.last_name && <span className="error-text">{errors.last_name}</span>}
                            </div>
                            <div className="form-group">
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    placeholder=" "
                                    className={errors.username ? "has-error" : ""}
                                />
                                <label htmlFor="username">Usuario</label>
                                {errors.username && <span className="error-text">{errors.username}</span>}
                            </div>
                            <div className="form-group">
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder=" "
                                    className={errors.email ? "has-error" : ""}
                                />
                                <label htmlFor="email">Email</label>
                                {errors.email && <span className="error-text">{errors.email}</span>}
                            </div>

                            <div className="form-group">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    id="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder=" "
                                    className={errors.password ? "has-error" : ""}
                                />
                                <label htmlFor="password">Contraseña</label>
                                <button type="button" className="toggle-password" onClick={() => togglePasswordVisibility("password")}>
                                    {showPassword ? "Ocultar" : "Mostrar"}
                                </button>
                                {errors.password && <span className="error-text">{errors.password}</span>}
                            </div>

                            <div className="form-group">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    placeholder=" "
                                    className={errors.confirmPassword ? "has-error" : ""}
                                />
                                <label htmlFor="confirmPassword">Confirmar contraseña</label>
                                <button type="button" className="toggle-password" onClick={() => togglePasswordVisibility("confirm")}>
                                    {showConfirmPassword ? "Ocultar" : "Mostrar"}
                                </button>
                                {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                            </div>

                            <label className="checkbox-container terms-checkbox">
                                <input type="checkbox" required />
                                <span className="checkmark"></span>
                                <span>
                                    Acepto los <a href="#terms">Términos de Servicio</a> y la <a href="#privacy">Política de Privacidad</a>
                                </span>
                            </label>

                            <button type="submit" className={`submit-button ${isLoading ? "loading" : ""}`} disabled={isLoading}>
                                <span className="button-text">Crear cuenta</span>
                                <span className="spinner"></span>
                            </button>
                            <button
                                type="button"
                                className={`submit-button cancel ${isLoading ? "loading" : ""}`}
                                onClick={() => navigate(`${PublicRoutes.HOME}`)}
                                disabled={isLoading}
                            >
                                <span className="button-text">Cancelar</span>
                                <span className="spinner"></span>
                            </button>
                        </form>

                        <div className="auth-footer">
                            <p>
                                ¿Ya tenés una cuenta?{" "}
                                <button
                                    type="button"
                                    onClick={() => navigate(`${PublicRoutes.LOGIN}`)}
                                    className="switch-link"
                                >
                                    Iniciar sesión
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Register