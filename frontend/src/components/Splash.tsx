import { BrandMark } from './AppShell';
import { Icon } from './Icon';

export function Splash() {
  return (
    <div className="splash" aria-busy="true" aria-live="polite">
      <BrandMark size={28} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** First visit with no signal: nothing saved on this phone yet. */
export function OfflineGate({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="gate">
      <Icon name="cloudOff" size={40} />
      <h1 className="page-title">Sin conexión</h1>
      <p>
        Todavía no hay datos guardados en este teléfono. Abrí la app una vez con señal y después vas
        a poder ver tus lotes aunque no tengas conexión.
      </p>
      <button type="button" className="btn btn--primary btn--block" onClick={onRetry}>
        <Icon name="refresh" />
        Probar de nuevo
      </button>
    </div>
  );
}
