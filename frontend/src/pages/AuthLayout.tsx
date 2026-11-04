import type { ReactNode } from 'react';
import { BrandMark } from '../components/AppShell';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth" id="contenido">
      <p className="auth-brand">
        <BrandMark size={22} />
        Gaucho Weather
      </p>
      <h1 className="survey-title auth-title">{title}</h1>
      {children}
    </main>
  );
}
