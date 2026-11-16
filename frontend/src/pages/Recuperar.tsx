import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { requestPasswordReset } from '../api/account';
import { FormAlert, TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { AuthLayout } from './AuthLayout';

/** S5: asks for a reset link. The answer is the same whether or not the email has an account. */
export function Recuperar() {
  const [email, setEmail] = useState('');
  const request = useMutation({ mutationFn: requestPasswordReset });

  function submit(event: FormEvent) {
    event.preventDefault();
    request.mutate(email.trim());
  }

  return (
    <AuthLayout title="Recuperar contraseña">
      {request.isSuccess ? (
        <p className="form-notice" role="status">
          <Icon name="check" />
          <span>
            Si hay una cuenta con {request.variables}, te mandamos un enlace para elegir una
            contraseña nueva. Vence en 1 hora.
          </span>
        </p>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <FormAlert message={request.error?.message} />
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            hint="El de tu cuenta. Te mandamos un enlace para elegir otra contraseña."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={request.isPending}
          >
            {request.isPending ? 'Mandando…' : 'Mandar enlace'}
          </button>
        </form>
      )}
      <p className="auth-switch">
        ¿Te acordaste? <Link to="/ingresar">Ingresar</Link>
      </p>
    </AuthLayout>
  );
}
