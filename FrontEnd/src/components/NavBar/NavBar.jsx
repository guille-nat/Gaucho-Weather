import { useState } from 'react';
import { Link } from 'react-router-dom';  // Importa Link desde react-router-dom
import { logout } from "../../redux/slices/authSlice"; 
import {clearPreferences} from "../../redux/slices/userPreferencesSlice"
import { PublicRoutes, PrivateRoutes } from '../../routes/routes';
import { useSelector, useDispatch } from 'react-redux';
import LogoApp from '../../../public/icons/logo_app/GauchoWeather-redondo.ico'
import LoginIcon from '../../assets/login.svg'
import LogoutIcon from '../../assets/logout.svg'
import RegisterIcon from '../../assets/register.svg'
import ProfileIcon from '../../assets/profile.svg'
import './style/Navbar.css'


const NavBar = () => {
    const [activeSection, setActiveSection] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
    };
    const isLoggedIn = useSelector((store) => store.auth.isLoggedIn);
    const dispatch = useDispatch();

    // Función cerrar sesión
    const handleLogout = () => {
        dispatch(logout());
        dispatch(clearPreferences());
    };

    return (
        <nav className="navbar">
            <div className="navbar-container">
                <div className="navbar-logo">
                    <Link to={PublicRoutes.HOME} className="navbar-link" onClick={() => { setMenuOpen(false) }}>
                        <img src={LogoApp} alt="Gaucho Weather" className='logo-app' />

                    </Link>
                </div>

                <div className="menu-toggle" onClick={toggleMenu}>
                    <div className={`hamburger ${menuOpen ? 'active' : ''}`}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>

                <ul className={`navbar-menu ${menuOpen ? 'active' : ''}`}>
                    <li
                        className={activeSection === 'inicio' ? 'active' : ''}
                    >
                        <Link to={PublicRoutes.HOME} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('inicio'); }}>
                            <span className="menu-icon">🏠</span>
                            <span className="menu-text">Inicio</span>
                        </Link>
                    </li>
                    
                        <li className={activeSection === 'profile' ? 'active' : ''}>
                            <Link to={PrivateRoutes.PROFILE} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('profile'); }}>
                                <span className="menu-icon">👤</span>
                                <span className="menu-text">Perfil</span>
                                
                            </Link>
                        </li>
                    <li
                        className={activeSection === 'historico' ? 'active' : ''}
                    >
                        <Link to={PrivateRoutes.HISTORIC} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('historico'); }}>
                            <span className="menu-icon">📅</span>
                            <span className="menu-text">Histórico</span>
                        </Link>
                    </li>
                    <li
                        className={activeSection === 'graficas' ? 'active' : ''}
                    >
                        <Link to={PrivateRoutes.GRAPHICS} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('graficas'); }}>
                            <span className="menu-icon">📊</span>
                            <span className="menu-text">Gráficas</span>
                        </Link>
                    </li>
                    <li
                        className={activeSection === 'informe' ? 'active' : ''}
                    >
                        <Link to={PublicRoutes.REPORTS} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('informe'); }}>
                            <span className="menu-icon">📝</span>
                            <span className="menu-text">Informe</span>
                        </Link>
                    </li>
                </ul>

                <div className="auth-buttons">
                    {isLoggedIn ? (
                        <>
                            <button className="auth-button logout" onClick={() => { handleLogout(); setMenuOpen(false); }}>
                                <img src={LogoutIcon} alt="Logout icon" className="auth-icon" />
                                <span className="auth-text">Salir</span>
                            </button>
                            
                        </>

                    ) : (
                        <>
                            <Link to={PublicRoutes.LOGIN} className="auth-button login navbar-link" onClick={() => { setMenuOpen(false) }}>
                                <img className="auth-icon" src={LoginIcon} alt='Login icons'></img>
                                <span className="auth-text">Ingresar</span>
                            </Link>
                            <Link to={PublicRoutes.REGISTER} className="auth-button register navbar-link" onClick={() => { setMenuOpen(false) }}>
                                <img src={RegisterIcon} alt="Register icon" className="auth-icon" />
                                <span className="auth-text">Registrarse</span>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default NavBar
