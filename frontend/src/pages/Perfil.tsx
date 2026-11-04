import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { logout } from '../api/auth';
import { FormAlert } from '../components/Field';
import { Icon } from '../components/Icon';
import { queryKeys } from '../query/keys';
import { useMe } from '../query/hooks';

/** Workbox runtime cache of /api/lotes/ (see vite.config.ts): private data, drop it on logout. */
const API_CACHE = 'api-lotes';

export function Perfil() {
  const me = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const exit = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
      queryClient.setQueryData(queryKeys.me, null);
      if ('caches' in window) await window.caches.delete(API_CACHE).catch(() => false);
      navigate('/ingresar', { replace: true });
    },
  });

  return (
    <div className="page page-profile">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="survey-title">Perfil</h1>
        </div>
      </header>
      {me.data ? (
        <dl className="facts">
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
        Al salir borramos de este teléfono los datos guardados para usar sin conexión.
      </p>
    </div>
  );
}
