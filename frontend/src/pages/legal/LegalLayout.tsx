import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '../../components/BrandMark';
import { Icon } from '../../components/Icon';
import { LegalLinks } from '../../components/Legal';
import { TERMS_VERSION, termsDate } from '../../lib/terms';

/**
 * A business datum nobody has filled in yet (promociones S0a): shown as is, in brackets, so the
 * draft cannot go live unnoticed. A lawyer reviews the texts before they do.
 */
export function Ph({ children }: { children: string }) {
  return <mark className="legal-placeholder">[{children}]</mark>;
}

export function Clause({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="legal-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

/** The frame of the three legal pages: public, outside the shell, with their version. */
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal" id="contenido">
      <div className="auth-top">
        <p className="auth-brand">
          <BrandMark size={36} />
          Gaucho Weather
        </p>
        <Link className="back-link" to="/">
          <Icon name="cloudSun" />
          Ver el clima
        </Link>
      </div>
      <h1 className="legal-title">{title}</h1>
      <p className="legal-version">
        Versión {TERMS_VERSION} · Vigente desde el {termsDate()}
      </p>
      <div className="legal-body">{children}</div>
      <footer className="legal-footer">
        <LegalLinks />
        <p className="fine">
          Consultas: <Ph>EMAIL DE CONTACTO</Ph>
        </p>
      </footer>
    </main>
  );
}
