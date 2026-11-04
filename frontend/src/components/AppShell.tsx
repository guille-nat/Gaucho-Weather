import { NavLink, Outlet, useLocation } from 'react-router';
import { useMe } from '../query/hooks';
import { Icon, type IconName } from './Icon';

const NAV: { to: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { to: '/', label: 'Clima', icon: 'cloudSun', match: (p) => p === '/' },
  { to: '/lotes', label: 'Lotes', icon: 'parcel', match: (p) => p.startsWith('/lotes') },
  { to: '/alertas', label: 'Alertas', icon: 'bell', match: (p) => p.startsWith('/alertas') },
  { to: '/perfil', label: 'Perfil', icon: 'user', match: (p) => p.startsWith('/perfil') },
];

export function AppShell() {
  const { pathname } = useLocation();
  // The session check runs on every screen, Inicio included: a session that ended elsewhere
  // still clears this phone (AppProviders), and a pending offline logout still finishes.
  useMe();
  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <nav className="tabbar" aria-label="Principal">
        <p className="tabbar-brand" aria-hidden="true">
          <BrandMark />
          Gaucho Weather
        </p>
        <ul>
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={active ? 'tab is-active' : 'tab'}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="tab-icon">
                    <Icon name={item.icon} size={24} strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <main id="contenido" className="shell-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

/** The brand mark: the pampa sun on the horizon, in gold. */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3.5 13a6.5 6.5 0 0 1 13 0Z" fill="#f2b705" />
      <path d="M1 15.5h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
