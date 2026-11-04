import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { logout } from '../api/auth';
import { ApiError } from '../api/client';
import { FormAlert } from '../components/Field';
import { CREDITS } from '../components/ForecastView';
import { Icon } from '../components/Icon';
import { useEndSession, useMe } from '../query/hooks';

/** What the login screen tells someone who just left (see Login). */
export interface SignedOutState {
  signedOut?: 'server' | 'local';
}

export function Perfil() {
  const me = useMe();
  const endSession = useEndSession();
  const navigate = useNavigate();

  async function leave(localOnly: boolean) {
    // Ends the session at once (me = null), then moves in the same tick: had we waited for the
    // cleanup, the guard would redirect first and this screen, unmounted, could not say why.
    const ending = endSession({ localOnly });
    const state: SignedOutState = { signedOut: localOnly ? 'local' : 'server' };
    navigate('/ingresar', { replace: true, state });
    await ending;
  }

  const exit = useMutation({
    mutationFn: logout,
    onSuccess: () => leave(false),
    // No signal: the farmer still wants this phone clean, so sign out here and tell them.
    onError: (error) => (error instanceof ApiError && error.isNetwork ? leave(true) : undefined),
  });

  return (
    <div className="page page-profile">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="page-title">Perfil</h1>
        </div>
      </header>
      {me.data ? (
        <dl className="facts panel">
          <div className="facts-row">
            <dt>Nombre</dt>
            <dd>{me.data.name || '—'}</dd>
          </div>
          <div className="facts-row">
            <dt>Email</dt>
            <dd className="break">{me.data.email}</dd>
          </div>
        </dl>
      ) : null}
      <FormAlert message={exit.error?.message} />
      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={() => exit.mutate()}
        disabled={exit.isPending}
      >
        <Icon name="logout" />
        {exit.isPending ? 'Saliendo…' : 'Salir'}
      </button>
      <p className="fine">
        Al salir borramos de este teléfono los datos de tu cuenta guardados para usar sin conexión.
        El pronóstico de los lugares que buscaste queda.
      </p>
      <p className="credits">{CREDITS}</p>
    </div>
  );
}
