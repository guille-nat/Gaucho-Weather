import { useId, useRef, type KeyboardEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { useMe } from '../query/hooks';
import { Cuentas } from './backoffice/Cuentas';
import { Informes } from './backoffice/Informes';
import { Pagos } from './backoffice/Pagos';
import { Pedidos } from './backoffice/Pedidos';
import { Precios } from './backoffice/Precios';
import { Registro } from './backoffice/Registro';
import { Resumen } from './backoffice/Resumen';

const TABS = [
  { id: 'resumen', label: 'Resumen', Panel: Resumen },
  { id: 'cuentas', label: 'Cuentas', Panel: Cuentas },
  { id: 'pedidos', label: 'Pedidos', Panel: Pedidos },
  { id: 'pagos', label: 'Pagos', Panel: Pagos },
  { id: 'precios', label: 'Precios', Panel: Precios },
  { id: 'registro', label: 'Registro', Panel: Registro },
  { id: 'informes', label: 'Informes', Panel: Informes },
] as const;

type TabId = (typeof TABS)[number]['id'];
const PARAM = 'seccion';

/**
 * The sections as ARIA tabs (modern-web-guidance `tabs`). Selection is by activation: the
 * arrows move focus and Enter or a click opens the tab, because opening one fetches its data and
 * changes the address. Only the open panel is mounted, so a tab asks the API only when opened.
 */
function BackofficeTabs() {
  const [params, setParams] = useSearchParams();
  const asked = params.get(PARAM);
  const selected = TABS.find((tab) => tab.id === asked) ?? TABS[0];
  const base = useId();
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  function select(id: TabId) {
    // The address keeps the section: a reload or a shared link opens it again.
    setParams(id === TABS[0].id ? {} : { [PARAM]: id }, { replace: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tabRefs.current[tab.id] === event.target);
    if (index < 0) return;
    const last = TABS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const id = TABS[next]?.id;
    const tab = id ? tabRefs.current[id] : undefined;
    tab?.focus();
    // On a phone the row scrolls: keep the focused tab in view.
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  const Panel = selected.Panel;
  return (
    <div className="bo-tabs">
      <div
        className="bo-tablist"
        role="tablist"
        aria-label="Secciones del backoffice"
        onKeyDown={onKeyDown}
      >
        {TABS.map((tab) => {
          const active = tab.id === selected.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              id={`${base}-${tab.id}`}
              type="button"
              role="tab"
              className="bo-tab-btn"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => select(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        className="bo-panel"
        aria-labelledby={`${base}-${selected.id}`}
        id={`${base}-${selected.id}-panel`}
      >
        <Panel key={selected.id} />
      </div>
    </div>
  );
}

/**
 * The backoffice for super admins (pagos-backoffice S6). The API answers a non-superuser with
 * 403, which the app reads as a lost session (query/client.ts), so nothing here asks it anything
 * until `me` says `is_superuser` (L5). Everyone else goes back to Perfil.
 */
export function Backoffice() {
  const me = useMe();
  if (me.data?.is_superuser !== true) return <Navigate to="/perfil" replace />;
  return (
    <div className="page page-backoffice">
      <header className="page-head">
        <Link className="back-link" to="/perfil">
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Perfil
        </Link>
        <h1 className="page-title">Backoffice</h1>
        <p className="page-lede">
          Cuentas, pedidos, pagos y precios de todas las cuentas. Cada cambio queda en el registro
          con tu nombre.
        </p>
      </header>
      <BackofficeTabs />
    </div>
  );
}
