import { NavLink, Outlet, useLocation } from 'react-router';
import { Icon, type IconName } from './Icon';

const NAV: { to: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { to: '/', label: 'Lotes', icon: 'parcel', match: (p) => p === '/' || p.startsWith('/lotes') },
  { to: '/alertas', label: 'Alertas', icon: 'bell', match: (p) => p.startsWith('/alertas') },
  { to: '/perfil', label: 'Perfil', icon: 'user', match: (p) => p.startsWith('/perfil') },
];

export function AppShell() {
  const { pathname } = useLocation();
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
                    <Icon name={item.icon} size={24} />
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

/** The brand's small survey mark: a boundary stake in catastro pink. */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 1.5 18.5 10 10 18.5 1.5 10Z" fill="#d6336c" />
      <path d="M10 6.5v7M6.5 10h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
