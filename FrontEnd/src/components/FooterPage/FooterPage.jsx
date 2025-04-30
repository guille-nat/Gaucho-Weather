import './style/FooterPage.css'
import LogoApp from '../../../public/icons/logo_app/nataliulla.ico'
function FooterPage() {
    return (
        <>
            <footer className="footer" lang="es">
                <div className='content-footer-main' >
                    <div className="footer-content">
                        <div className="footer-logo">
                            <img className='logo-app-footer'
                                src={LogoApp}
                                alt="Gaucho Weather"
                            />
                            <a
                                target="_blank"
                                href="https://www.nataliullacoder.com"
                                className="non_decore"
                            >
                                nataliullacoder.com
                            </a>
                        </div>
                        <div className="footer-links">
                            <a className="non_decore" href="#about" target="_blank">
                                Sobre Nosotros
                            </a>
                            <a className="non_decore" href="#services" target="_blank">
                                Servicios
                            </a>
                            <a className="non_decore" href="#contact" target="_blank">
                                Contacto
                            </a>
                        </div>
                    </div>
                    <div className="footer-bottom">
                        <p>
                            &copy; 2025 Gaucho Weather. Desarrollado por nataliullacoder. Todos los
                            derechos reservados.
                        </p>
                    </div>
                </div>
            </footer>
        </>
    );
}
export default FooterPage;
