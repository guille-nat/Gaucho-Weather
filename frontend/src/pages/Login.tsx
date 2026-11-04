import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { login } from '../api/auth';
import { ApiError } from '../api/client';
import { FormAlert, PasswordField, TextField } from '../components/Field';
import { useStartSession } from '../query/hooks';
import { AuthLayout } from './AuthLayout';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const startSession = useStartSession();
  const mutation = useMutation({ mutationFn: login, onSuccess: startSession });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ email: email.trim(), password });
  }

  const error = mutation.error instanceof ApiError ? mutation.error : null;

  return (
    <AuthLayout title="Ingresar">
      <form className="form" onSubmit={submit} noValidate>
        <FormAlert message={error?.message} />
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--block" disabled={mutation.isPending}>
          {mutation.isPending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className="auth-switch">
        ¿Es tu primera vez? <Link to="/crear-cuenta">Crear cuenta</Link>
      </p>
    </AuthLayout>
  );
}
