import { useNavigate } from 'react-router-dom';
import './style/NotFound.css';
import sunIcon from '../../assets/sun.svg';

const NotFound = () =>{
    const navigate = useNavigate();

    return (
        <div className="not-found-container">
            <div className="not-found-content">
                <img src={sunIcon} alt="Sol" className="not-found-icon" />
                <h1>404</h1>
                <h2>¡Ups! Nos perdimos en el campo</h2>
                <p>Parece que esta página se voló con el viento pampeano</p>
                <button
                    className="return-button"
                    onClick={() => navigate('/')}
                >
                    Volver al Inicio
                </button>
            </div>
            
        </div>
    );
}

export default NotFound;