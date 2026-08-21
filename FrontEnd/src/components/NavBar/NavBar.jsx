import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';  // Importa Link desde react-router-dom
import { Home, User, CalendarDays, BarChart3, FileText, LogIn, LogOut, UserPlus } from 'lucide-react';
import { logout } from "../../redux/slices/authSlice";
import {clearPreferences} from "../../redux/slices/userPreferencesSlice"
import { PublicRoutes, PrivateRoutes } from '../../routes/routes';
import { useSelector, useDispatch } from 'react-redux';
import LogoApp from '../../../public/icons/logo_app/GauchoWeather-redondo.ico'
import './style/Navbar.css'


const NavBar = () => {
    const [activeSection, setActiveSection] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const menuToggleRef = useRef(null);
    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
    };
    const isLoggedIn = useSelector((store) => store.auth.isLoggedIn);
    const dispatch = useDispatch();
    const location = useLocation();
    // Ocultar el CTA redundante: en /login no tiene sentido ofrecer
    // "Ingresar" de nuevo, y lo mismo para "Registrarse" en /register.
    const isLoginPage = location.pathname === PublicRoutes.LOGIN;
    const isRegisterPage = location.pathname === PublicRoutes.REGISTER;

    // Función cerrar sesión
    const handleLogout = () => {
        dispatch(logout());
        dispatch(clearPreferences());
    };

    // Escape sigue el patrón ARIA disclosure: cierra el menú y devuelve el
    // foco al control que lo abrió, sin importar si el foco está en el
    // toggle o en uno de los links de adentro.
    const closeMenuAndFocusToggle = () => {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
    };

    // El hamburger es un div interactivo, no un <button>: necesita el mismo
    // patrón de accesibilidad que los encabezados de acordeón de Home.jsx
    // (role, tabIndex, aria-expanded/aria-label, Enter/Space).
    const handleMenuToggleKeyDown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleMenu();
        } else if (event.key === "Escape" && menuOpen) {
            event.preventDefault();
            closeMenuAndFocusToggle();
        }
    };

    // Escape también tiene que funcionar con el foco dentro del menú (en un
    // link), no solo en el toggle: el keydown de un link no burbujea hasta
    // el div del hamburger, que es un hermano, no un ancestro.
    const handleMenuKeyDown = (event) => {
        if (event.key === "Escape" && menuOpen) {
            event.preventDefault();
            closeMenuAndFocusToggle();
        }
    };

    return (
        <nav className="navbar">
            <div className="navbar-container">
                <div className="navbar-logo">
                    <Link to={PublicRoutes.HOME} className="navbar-link" onClick={() => { setMenuOpen(false) }}>
                        <img src={LogoApp} alt="Gaucho Weather" className='logo-app' />

                    </Link>
                </div>

                <div
                    ref={menuToggleRef}
                    className="menu-toggle"
                    role="button"
                    tabIndex={0}
                    aria-expanded={menuOpen}
                    aria-controls="navbar-menu"
                    aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                    onClick={toggleMenu}
                    onKeyDown={handleMenuToggleKeyDown}
                >
                    <div className={`hamburger ${menuOpen ? 'active' : ''}`}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>

                <ul
                    id="navbar-menu"
                    className={`navbar-menu ${menuOpen ? 'active' : ''}`}
                    onKeyDown={handleMenuKeyDown}
                >
                    <li
                        className={activeSection === 'inicio' ? 'active' : ''}
                    >
                        <Link to={PublicRoutes.HOME} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('inicio'); }}>
                            <Home className="menu-icon" aria-hidden="true" />
                            <span className="menu-text">Inicio</span>
                        </Link>
                    </li>

                        <li className={activeSection === 'profile' ? 'active' : ''}>
                            <Link to={PrivateRoutes.PROFILE} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('profile'); }}>
                                <User className="menu-icon" aria-hidden="true" />
                                <span className="menu-text">Perfil</span>

                            </Link>
                        </li>
                    <li
                        className={activeSection === 'historico' ? 'active' : ''}
                    >
                        <Link to={PrivateRoutes.HISTORIC} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('historico'); }}>
                            <CalendarDays className="menu-icon" aria-hidden="true" />
                            <span className="menu-text">Histórico</span>
                        </Link>
                    </li>
                    <li
                        className={activeSection === 'graficas' ? 'active' : ''}
                    >
                        <Link to={PrivateRoutes.GRAPHICS} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('graficas'); }}>
                            <BarChart3 className="menu-icon" aria-hidden="true" />
                            <span className="menu-text">Gráficas</span>
                        </Link>
                    </li>
                    <li
                        className={activeSection === 'informe' ? 'active' : ''}
                    >
                        <Link to={PublicRoutes.REPORTS} className="navbar-link" onClick={() => { setMenuOpen(false); setActiveSection('informe'); }}>
                            <FileText className="menu-icon" aria-hidden="true" />
                            <span className="menu-text">Informe</span>
                        </Link>
                    </li>
                </ul>

                <div className="auth-buttons">
                    {isLoggedIn ? (
                        <button
                            className="auth-button logout"
                            aria-label="Salir"
                            onClick={() => { handleLogout(); setMenuOpen(false); }}
                        >
                            <LogOut className="auth-icon" aria-hidden="true" />
                            <span className="auth-text">Salir</span>
                        </button>
                    ) : (
                        <>
                            {!isLoginPage && (
                                <Link
                                    to={PublicRoutes.LOGIN}
                                    className="auth-button login navbar-link"
                                    aria-label="Ingresar"
                                    onClick={() => { setMenuOpen(false) }}
                                >
                                    <LogIn className="auth-icon" aria-hidden="true" />
                                    <span className="auth-text">Ingresar</span>
                                </Link>
                            )}
                            {!isRegisterPage && (
                                <Link
                                    to={PublicRoutes.REGISTER}
                                    className="auth-button register navbar-link"
                                    aria-label="Registrarse"
                                    onClick={() => { setMenuOpen(false) }}
                                >
                                    <UserPlus className="auth-icon" aria-hidden="true" />
                                    <span className="auth-text">Registrarse</span>
                                </Link>
                            )}
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default NavBar
