import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../query/hooks';
import { OfflineGate, Splash } from './Splash';

export interface FromState {
  from?: string;
}

/** Private screens: anonymous visitors go to /ingresar and come back afterwards. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.data === undefined) {
    if (me.isError || me.fetchStatus === 'paused')
      return <OfflineGate onRetry={() => void me.refetch()} />;
    return <Splash />;
  }
  if (me.data === null) {
    const state: FromState = { from: location.pathname + location.search };
    return <Navigate to="/ingresar" replace state={state} />;
  }
  return <Outlet />;
}

/** Login and sign-up: a logged-in user has nothing to do here. */
export function PublicOnly() {
  const me = useMe();
  const location = useLocation();
  if (me.data) {
    const from = (location.state as FromState | null)?.from;
    // With nowhere to return to, an account is for the lotes (S8).
    return <Navigate to={from && from !== '/ingresar' ? from : '/lotes'} replace />;
  }
  // Wait for the session check (and the IndexedDB restore) so the form never mounts twice.
  if (me.data === undefined && !me.isError && me.fetchStatus !== 'paused') return <Splash />;
  return <Outlet />;
}
