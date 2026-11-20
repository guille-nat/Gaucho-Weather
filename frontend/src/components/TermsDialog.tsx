import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptTerms } from '../api/auth';
import type { User } from '../api/types';
import { termsDate } from '../lib/terms';
import { useSignOut } from '../lib/useSignOut';
import { queryKeys } from '../query/keys';
import { useMe } from '../query/hooks';
import { FormAlert } from './Field';
import { LegalLinks } from './Legal';
import { Modal } from './Modal';

/**
 * Updated terms (promociones S0c): an account that has not accepted the current version cannot
 * use the app until it accepts or leaves. Existing accounts, founders included, see it once
 * after the deploy. A `me` from before the field existed says nothing, so nothing shows.
 */
export function TermsDialog() {
  const me = useMe();
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: acceptTerms,
    onSuccess: (user: User) => queryClient.setQueryData(queryKeys.me, user),
  });
  const exit = useSignOut();
  const busy = accept.isPending || exit.isPending;
  // Mounted only while needed, so no closed dialog sits in every screen.
  if (me.data?.terms_accepted !== false) return null;

  return (
    <Modal open title="Actualizamos los términos" blocking>
      <p>
        Hay una versión nueva de los Términos y condiciones, la Política de privacidad y las Reglas
        del programa, vigente desde el {termsDate(me.data?.terms_version)}. Para seguir usando tu
        cuenta, leelos y aceptalos.
      </p>
      <LegalLinks newTab />
      <FormAlert message={accept.error?.message ?? exit.error?.message} />
      <div className="app-dialog-actions">
        <button
          type="button"
          className="btn btn--primary btn--block"
          data-autofocus
          disabled={busy}
          onClick={() => accept.mutate()}
        >
          {accept.isPending ? 'Guardando…' : 'Acepto'}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          disabled={busy}
          onClick={() => exit.mutate()}
        >
          {exit.isPending ? 'Saliendo…' : 'Salir'}
        </button>
      </div>
    </Modal>
  );
}
