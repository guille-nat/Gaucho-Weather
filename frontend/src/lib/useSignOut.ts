import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { logout } from '../api/auth';
import { ApiError } from '../api/client';
import type { SignedOutState } from '../pages/Perfil';
import { forgetPushBeforeLogout, useEndSession } from '../query/hooks';
import { rememberSignedOut, type SignedOutReason } from './signedOut';

/** Ends the session here and goes to /ingresar, which says why (see Login). */
export function useLeave() {
  const endSession = useEndSession();
  const navigate = useNavigate();
  return async (signedOut: SignedOutReason) => {
    // Ends the session at once (me = null), then moves in the same tick: had we waited for the
    // cleanup, the guard would redirect first and this screen, unmounted, could not say why.
    rememberSignedOut(signedOut); // survives a guard redirect that lands first (lib/signedOut)
    const ending = endSession({ localOnly: signedOut === 'local' });
    const state: SignedOutState = { signedOut };
    navigate('/ingresar', { replace: true, state });
    await ending;
  };
}

/** "Salir", from Perfil and from the updated-terms dialog (promociones S0c). */
export function useSignOut() {
  const leave = useLeave();
  return useMutation({
    // A shared phone: drop this browser's push first, while the session can still say whose.
    mutationFn: async () => {
      await forgetPushBeforeLogout();
      await logout();
    },
    onSuccess: () => leave('server'),
    // No signal: the farmer still wants this phone clean, so sign out here and tell them.
    onError: (error) => (error instanceof ApiError && error.isNetwork ? leave('local') : undefined),
  });
}
