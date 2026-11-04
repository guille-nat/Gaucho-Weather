import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '../components/AppShell';
import { Icon } from '../components/Icon';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth" id="contenido">
      <div className="auth-top">
        <p className="auth-brand">
          <BrandMark size={24} />
          Gaucho Weather
        </p>
        <Link className="back-link" to="/">
          <Icon name="cloudSun" />
          Ver el clima
        </Link>
      </div>
      <h1 className="auth-title">{title}</h1>
      <p className="auth-lead">
        El pronóstico es libre. Con una cuenta guardás tus lotes y ves las decisiones de cada uno.
      </p>
      {children}
    </main>
  );
}
