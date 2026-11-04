import { Icon } from '../components/Icon';

export function Alertas() {
  return (
    <div className="page page-alerts">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="page-title">Alertas</h1>
        </div>
      </header>
      <section className="placeholder panel">
        <Icon name="bell" size={36} />
        <h2 className="placeholder-title">Las alertas llegan en una próxima versión</h2>
        <p>
          Vamos a avisarte antes de una helada a nivel del suelo y cuando se abra una ventana para
          pulverizar, por notificación y por WhatsApp.
        </p>
        <p>
          Mientras tanto, cada lote muestra sus decisiones de hoy: helada, pulverización y labores.
        </p>
      </section>
    </div>
  );
}
