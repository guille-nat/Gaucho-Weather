import { useId, ViewTransition } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { founderLabel } from '../lib/membership';
import { useMe } from '../query/hooks';
import { BrandMark } from './BrandMark';
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
  const me = useMe();
  const founder = me.data?.founder_number ?? null;
  const founderId = useId();
  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <nav className="tabbar" aria-label="Principal">
        <p className="tabbar-brand" aria-hidden="true">
          <BrandMark size={28} />
          Gaucho Weather
        </p>
        <ul>
          {NAV.map((item) => {
            const active = item.match(pathname);
            // A founder's account tab carries a small gold seal (S13); the name stays "Perfil".
            const sealed = item.to === '/perfil' && founder !== null;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={active ? 'tab is-active' : 'tab'}
                  aria-current={active ? 'page' : undefined}
                  aria-describedby={sealed ? founderId : undefined}
                >
                  {active ? (
                    // One shared element. The router runs each navigation as a React
                    // transition, so on a tab change React starts a view transition: the lens
                    // travels to the new tab while the page cross-fades as the root
                    // (motion-pass S2). Without the API the tab simply changes.
                    <ViewTransition name="tab-lens">
                      <span className="tab-lens" aria-hidden="true" />
                    </ViewTransition>
                  ) : null}
                  <span className="tab-icon">
                    <Icon name={item.icon} size={24} strokeWidth={active ? 2.4 : 2} />
                    {sealed ? (
                      <span className="tab-founder" aria-hidden="true">
                        <Icon name="sun" size={12} strokeWidth={2.6} />
                      </span>
                    ) : null}
                  </span>
                  {item.label}
                </NavLink>
                {sealed ? (
                  <span id={founderId} hidden>
                    {founderLabel(founder)}
                  </span>
                ) : null}
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
