import '../../styles/Main.css';


const Historic = () => {
    return (
        <div className="section-container">
          <h2>Histórico Climático</h2>
          <p className="section-description">Consulta datos históricos del clima en tu región.</p>
          <div className="placeholder-content">
            <p>Selecciona un rango de fechas para ver el histórico climático.</p>
            <div className="date-selector">
              <div className="date-input">
                <label>Desde:</label>
                <input type="date" />
              </div>
              <div className="date-input">
                <label>Hasta:</label>
                <input type="date" />
              </div>
              <button className="action-button">Consultar</button>
            </div>
            <div className="historical-placeholder">
              <div className="placeholder-chart"></div>
              <p>Los datos históricos se mostrarán aquí.</p>
            </div>
          </div>
        </div>
      );
};

export default Historic
