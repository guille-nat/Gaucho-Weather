import { Icon } from '../Icon';

/** While a tab's first answer is on its way: the app's skeleton, read out once. */
export function Loading({ what }: { what: string }) {
  return (
    <div className="account-skeleton" aria-busy="true">
      <p className="sr-only" role="status">
        Cargando {what}…
      </p>
      <span className="ghost ghost--panel" />
      <span className="ghost ghost--line" />
      <span className="ghost ghost--line ghost--short" />
    </div>
  );
}

/** A failed read, in the API's words, with the way to try again. */
export function LoadFailed({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="notice">
      <p>{error.message}</p>
      <button type="button" className="btn btn--secondary" onClick={onRetry}>
        <Icon name="refresh" />
        Reintentar
      </button>
    </div>
  );
}
