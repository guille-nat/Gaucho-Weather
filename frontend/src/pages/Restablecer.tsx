import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { confirmPasswordReset } from '../api/account';
import { ApiError } from '../api/client';
import { FormAlert, PasswordField } from '../components/Field';
import { AuthLayout } from './AuthLayout';
import type { SignedOutState } from './Perfil';

/** S5: the page an emailed reset link opens (/restablecer/<uid>/<token>). */
export function Restablecer() {
  const { uid = '', token = '' } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const confirm = useMutation({
    mutationFn: confirmPasswordReset,
    onSuccess: () => {
      const state: SignedOutState = { passwordReset: true };
      navigate('/ingresar', { replace: true, state });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    confirm.mutate({ uid, token, new_password: password });
  }

  const error = confirm.error instanceof ApiError ? confirm.error : null;
  const fieldError = error?.fieldErrors.new_password?.[0];
  // A bad or expired link answers with a detail and no field errors.
  const linkError = error && !fieldError ? error.message : null;

  return (
    <AuthLayout title="Elegí una contraseña nueva">
      <form className="form" onSubmit={submit} noValidate>
        <FormAlert message={linkError}>
          {error?.status === 400 ? (
            <Link className="form-alert-link" to="/recuperar">
              Pedir otro enlace
            </Link>
          ) : null}
        </FormAlert>
        <PasswordField
          label="Contraseña nueva"
          name="new_password"
          autoComplete="new-password"
          hint="Al menos 8 caracteres. Cerramos las sesiones abiertas de tu cuenta."
          value={password}
          error={fieldError}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--block" disabled={confirm.isPending}>
          {confirm.isPending ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </AuthLayout>
  );
}
