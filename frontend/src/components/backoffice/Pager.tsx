import { Icon } from '../Icon';

/** DRF pages hold 50 rows (backend/apps/backoffice/views.py BackofficePagination). */
export const PAGE_SIZE = 50;

/** Previous and next under a paginated list; nothing when everything fits on one page. */
export function Pager({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (pages === 1) return null;
  return (
    <nav className="bo-pager" aria-label="Páginas">
      <button
        type="button"
        className="btn btn--secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <Icon name="chevronLeft" strokeWidth={2.4} />
        Anterior
      </button>
      <p className="bo-pager-where">
        Página {page} de {pages}
      </p>
      <button
        type="button"
        className="btn btn--secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Siguiente
        <Icon name="chevronRight" strokeWidth={2.4} />
      </button>
    </nav>
  );
}
