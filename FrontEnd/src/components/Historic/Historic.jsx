import { Link } from 'react-router-dom';
import { Hourglass, CalendarDays, FileText } from 'lucide-react';
import { PublicRoutes } from '../../routes/routes';
import './style/Historic.css';

// No existe todavía un endpoint de históricos en el backend (BackEnd/weather/urls.py
// solo expone weathers-now / weathers-days / frost-risk), así que en vez de simular
// un selector de fechas y un botón "Consultar" que no hacen nada, esta pantalla es
// honesta sobre el estado de la función y ofrece un dato real disponible hoy: el
// informe semanal.
const Historic = () => {
    return (
        <div className="historic-container">
            <article className="historic-card">
                <span className="historic-card-tag">
                    <Hourglass size={14} aria-hidden="true" />
                    Próximamente
                </span>
                <div className="historic-card-row">
                    <div className="historic-card-icon" aria-hidden="true">
                        <CalendarDays size={28} strokeWidth={2} />
                    </div>
                    <div className="historic-card-text">
                        <h1 className="historic-card-title">Histórico climático</h1>
                        <p className="historic-card-detail">
                            Estamos construyendo el histórico de tu campo: vas a poder revisar
                            temperatura, lluvia y heladas de meses anteriores para comparar
                            temporadas y planificar mejor la próxima siembra.
                        </p>
                    </div>
                </div>
                <Link to={PublicRoutes.REPORTS} className="historic-card-cta">
                    <FileText size={18} aria-hidden="true" />
                    Mientras tanto, mirá el informe semanal
                </Link>
            </article>
        </div>
    );
};

export default Historic;
