import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PublicRoutes } from '../../routes/routes';
import { confirmEmailVerification } from '../../services/emailVerificationService';
import Feedback from '../Feedback';
import GauchoLogo from '../../../public/icons/logo_app/GauchoWeather-redondo.ico';
import '../../styles/Auth-Register.css';
import './style/VerifyEmail.css';

// Ruta y query param (token) definidos por
// BackEnd/users/emails.py::send_verification_email — deben coincidir.
const VerifyEmail = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();

    // 'verifying' | 'success' | 'error' | 'invalid' (sin token en la URL)
    const [status, setStatus] = useState(token ? 'verifying' : 'invalid');
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        if (!token) return undefined;

        let cancelled = false;
        const verify = async () => {
            try {
                const data = await confirmEmailVerification(token);
                if (cancelled) return;
                setFeedback({ type: 'success', message: data?.detail || 'Tu cuenta fue verificada.' });
                setStatus('success');
            } catch (error) {
                if (cancelled) return;
                const serverData = error.response?.data;
                setFeedback({
                    type: 'error',
                    message: serverData?.error || 'No pudimos verificar tu cuenta. El enlace puede haber vencido.',
                });
                setStatus('error');
            }
        };

        verify();
        return () => {
            cancelled = true;
        };
    }, [token]);

    if (status === 'invalid') {
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
                                message="Este enlace de verificación es inválido o está incompleto."
                                autoDismiss={false}
                            />
                            <div className="auth-footer">
                                <p>
                                    <button
                                        type="button"
                                        onClick={() => navigate(PublicRoutes.LOGIN)}
                                        className="switch-link"
                                    >
                                        Ir a iniciar sesión
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
                            <h1>Confirmá tu cuenta</h1>
                            {status === 'verifying' && <p>Estamos verificando tu correo…</p>}
                        </div>

                        {feedback && (
                            <Feedback
                                type={feedback.type}
                                message={feedback.message}
                                autoDismiss={false}
                                onDismiss={() => setFeedback(null)}
                            />
                        )}

                        {status !== 'verifying' && (
                            <div className="auth-footer">
                                <p>
                                    <button
                                        type="button"
                                        onClick={() => navigate(PublicRoutes.LOGIN)}
                                        className="switch-link"
                                    >
                                        Ir a iniciar sesión
                                    </button>
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VerifyEmail;
