import { useId } from 'react';
import { Link } from 'react-router';
import { LEGAL_PAGES } from '../lib/terms';
import { FieldError } from './Field';

/**
 * The three legal pages (promociones S0a). `newTab` opens them in a new tab, so a form or a
 * dialog keeps what was typed while they are read.
 */
export function LegalLinks({ newTab = false }: { newTab?: boolean }) {
  return (
    <ul className="legal-links" aria-label="Términos y reglas">
      {LEGAL_PAGES.map((page) => (
        <li key={page.to}>
          <Link
            to={page.to}
            target={newTab ? '_blank' : undefined}
            rel={newTab ? 'noopener' : undefined}
          >
            {page.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Leí y acepto…": sent as `acepta_terminos`; the server's message shows below it (S0b). */
export function TermsCheckbox({
  checked,
  onChange,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}) {
  const id = useId();
  const [terms, privacy, rules] = LEGAL_PAGES;
  const link = (page: (typeof LEGAL_PAGES)[number]) => (
    <Link to={page.to} target="_blank" rel="noopener">
      {page.label}
    </Link>
  );
  return (
    <div className="field terms-check">
      <div className="terms-check-row">
        <input
          id={id}
          type="checkbox"
          className="checkbox"
          name="acepta_terminos"
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id}>
          Leí y acepto los {link(terms)}, la {link(privacy)} y las {link(rules)}.
        </label>
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
