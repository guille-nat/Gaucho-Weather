import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { register } from '../api/auth';
import { ApiError } from '../api/client';
import { useStartSession } from '../query/hooks';
import { FormAlert, PasswordField, TextField } from '../components/Field';
import { AuthLayout } from './AuthLayout';

export function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const startSession = useStartSession();
  const mutation = useMutation({ mutationFn: register, onSuccess: startSession });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ name: name.trim(), email: email.trim(), password });
  }

  const error = mutation.error instanceof ApiError ? mutation.error : null;
  const fields = error?.fieldErrors ?? {};

  return (
    <AuthLayout title="Crear cuenta">
      <form className="form" onSubmit={submit} noValidate>
        <FormAlert message={error?.message} />
        <TextField
          label="Nombre"
          name="name"
          autoComplete="name"
          value={name}
          error={fields.name?.[0]}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          error={fields.email?.[0]}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="new-password"
          hint="Mínimo 8 caracteres."
          value={password}
          error={fields.password?.[0]}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--block" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p className="auth-switch">
        ¿Ya tenés cuenta? <Link to="/ingresar">Ingresar</Link>
      </p>
    </AuthLayout>
  );
}
