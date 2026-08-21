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
                                rel="noreferrer"
                                href="https://www.nataliullacoder.com"
                                className="non_decore"
                            >
                                nataliullacoder.com
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
