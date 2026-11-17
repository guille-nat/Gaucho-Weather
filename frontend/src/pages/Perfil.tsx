import { useMutation } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { changePassword, deleteAccount } from '../api/account';
import { logout } from '../api/auth';
import { ApiError } from '../api/client';
import type { User } from '../api/types';
import { FormAlert, PasswordField, TextField } from '../components/Field';
import { CREDITS } from '../components/ForecastView';
import { FounderBadge } from '../components/FounderBadge';
import { Icon } from '../components/Icon';
import { StatusChip } from '../components/StatusChip';
import {
  forgetPushBeforeLogout,
  useEnablePush,
  useEndSession,
  useMe,
  usePushHere,
  useUpdateAccount,
  useUpdatePreferences,
} from '../query/hooks';
import { fieldError, formError } from '../lib/formErrors';
import { membership, trialLine } from '../lib/membership';

/** What the login screen tells someone who just left (see Login). */
export interface SignedOutState {
  signedOut?: 'server' | 'local' | 'deleted';
  /** They just chose a new password from an emailed link. */
  passwordReset?: boolean;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="panel account-section" aria-labelledby={id}>
      <h2 className="panel-title" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Always mounted, so screen readers hear each change; `saving` shows the wait, not the tick. */
export function Saved({ message, saving = false }: { message: string | null; saving?: boolean }) {
  return (
    <p className={saving ? 'account-saved account-saved--saving' : 'account-saved'} role="status">
      {message ? (
        <>
          <Icon name={saving ? 'clock' : 'check'} size={18} strokeWidth={2.6} />
          {message}
        </>
      ) : null}
    </p>
  );
}

function PlanSection({ me }: { me: User }) {
  if (!me.plan) return null;
  const lotes = me.usage?.lotes ?? 0;
  const line = membership(me);
  const trialEnds = me.founder_number == null ? me.plan_expires_at : null;
  return (
    <Section title="Tu plan">
      <p className="account-plan">{me.plan.name}</p>
      {trialEnds ? (
        // The deadline is the fact that matters most here, so it is not fine print (S10).
        <>
          <StatusChip tone="pending">{trialLine(trialEnds)}</StatusChip>
          <p>Cuando termine pasás a Básico.</p>
        </>
      ) : line ? (
        <p className="fine">{line}</p>
      ) : null}
      <p className="account-usage">
        {me.plan.max_lotes === null ? `${lotes} lotes` : `${lotes} de ${me.plan.max_lotes} lotes`}
      </p>
      <div className="account-links">
        <Link className="account-link" to="/perfil/suscripcion">
          Tu suscripción
        </Link>
        <Link className="account-link" to="/planes">
          Comparar planes
        </Link>
      </div>
    </Section>
  );
}

/** The `name` that makes "Tus datos" open one row at a time (perfil-ux S3). */
const DATOS_GROUP = 'account-data';

/**
 * A row that shows what the account holds now and opens the form that changes it: a native
 * details/summary (modern-web-guidance `accordion`), the marker right before the label. The form
 * mounts only while open, so a closed row leaves no second "Contraseña actual" in the page.
 */
function Row({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="account-row"
      name={DATOS_GROUP}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="account-row-head">
        <Icon name="chevronRight" className="account-row-chevron" strokeWidth={2.4} />
        <span className="account-row-text">
          {/* The space keeps "Email ana@…" apart for screen readers; grid drops it on screen. */}
          <span className="account-row-label">{label}</span>{' '}
          <span className="account-row-value">{value}</span>
        </span>
      </summary>
      {open ? children : null}
    </details>
  );
}

/**
 * Where `name` on details is unsupported, close the other rows ourselves (the guide's fallback):
 * S3 asks for one form at a time.
 */
function useExclusiveDetails(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element || Object.hasOwn(HTMLDetailsElement.prototype, 'name')) return;
    const onToggle = (event: Event) => {
      const opened = event.target;
      if (!(opened instanceof HTMLDetailsElement) || !opened.open) return;
      for (const other of element.querySelectorAll<HTMLDetailsElement>(
        `details[name="${DATOS_GROUP}"]`,
      )) {
        if (other !== opened) other.open = false;
      }
    };
    // toggle does not bubble, hence capture.
    element.addEventListener('toggle', onToggle, true);
    return () => element.removeEventListener('toggle', onToggle, true);
  }, [root]);
}

/**
 * These forms are noValidate, so after a refused submit focus goes to the first field with an
 * error, where the screen reader reads it (modern-web-guidance accessible-error-announcement).
 */
function useFocusFirstInvalid(error: unknown) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (error) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);
  return form;
}

function NameForm({ me }: { me: User }) {
  const [name, setName] = useState(me.name);
  const rename = useUpdateAccount();
  const form = useFocusFirstInvalid(rename.error);

  function save(event: FormEvent) {
    event.preventDefault();
    rename.mutate({ name: name.trim() });
  }

  return (
    <form ref={form} className="form account-form" onSubmit={save} noValidate>
      <TextField
        label="Nombre"
        name="name"
        autoComplete="name"
        value={name}
        error={fieldError(rename.error, 'name')}
        onChange={(e) => {
          rename.reset();
          setName(e.target.value);
        }}
      />
      <FormAlert message={formError(rename.error)} />
      <button
        type="submit"
        className="btn btn--secondary"
        disabled={rename.isPending || !name.trim() || name.trim() === me.name}
      >
        Guardar nombre
      </button>
      <Saved message={rename.isSuccess ? 'Nombre guardado.' : null} />
    </form>
  );
}

function EmailForm({ me }: { me: User }) {
  const [email, setEmail] = useState(me.email);
  const [password, setPassword] = useState('');
  const reEmail = useUpdateAccount();
  const form = useFocusFirstInvalid(reEmail.error);

  function save(event: FormEvent) {
    event.preventDefault();
    reEmail.mutate(
      { email: email.trim(), current_password: password },
      { onSuccess: () => setPassword('') },
    );
  }

  return (
    <form ref={form} className="form account-form" onSubmit={save} noValidate>
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        error={fieldError(reEmail.error, 'email')}
        onChange={(e) => {
          reEmail.reset();
          setEmail(e.target.value);
        }}
      />
      <PasswordField
        label="Contraseña actual"
        name="current_password"
        autoComplete="current-password"
        hint="Para cambiar el email confirmá que sos vos."
        value={password}
        error={fieldError(reEmail.error, 'current_password')}
        onChange={(e) => {
          reEmail.reset();
          setPassword(e.target.value);
        }}
      />
      <FormAlert message={formError(reEmail.error)} />
      <button
        type="submit"
        className="btn btn--secondary"
        disabled={reEmail.isPending || !password || !email.trim() || email.trim() === me.email}
      >
        Cambiar email
      </button>
      <Saved message={reEmail.isSuccess ? 'Email cambiado.' : null} />
    </form>
  );
}

function DatosSection({ me }: { me: User }) {
  const rows = useRef<HTMLDivElement>(null);
  useExclusiveDetails(rows);
  return (
    <Section title="Tus datos">
      <div className="account-rows" ref={rows}>
        <Row label="Nombre" value={me.name}>
          <NameForm me={me} />
        </Row>
        <Row label="Email" value={me.email}>
          <EmailForm me={me} />
        </Row>
        <Row label="Contraseña" value="La que usás para entrar">
          <PasswordForm />
        </Row>
      </div>
    </Section>
  );
}

export function Toggle({
  label,
  checked,
  disabled,
  describedBy,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  /** The id of the sentence that explains the switch, e.g. why it is disabled. */
  describedBy?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** Shared with Alertas, so both screens explain a block the same way. */
export const PUSH_BLOCKED =
  'Las notificaciones están bloqueadas en el navegador. Habilitalas en los permisos del sitio y volvé a probar.';

/**
 * The account preference says push; this says whether this phone gets it, and turns it on with
 * the same flow as Alertas (perfil-ux S7): a gold switch must not promise a phone that is silent.
 */
function PushHere() {
  const here = usePushHere();
  const enable = useEnablePush();
  const [answer, setAnswer] = useState<NotificationPermission | null>(null);
  if (!here.data?.supported) return null;

  if (here.data.endpoint !== null) {
    return (
      <p className="push-state">
        <Icon name="bell" size={20} />
        Activadas en este teléfono.
      </p>
    );
  }
  if (answer === 'denied' || here.data.permission === 'denied') {
    return <p className="fine">{PUSH_BLOCKED}</p>;
  }
  return (
    <div className="push-here">
      <p className="fine">Este teléfono todavía no recibe notificaciones.</p>
      {answer === 'default' ? (
        <p className="fine">Hace falta tu permiso para avisarte en este teléfono.</p>
      ) : null}
      <FormAlert message={enable.error?.message} />
      <button
        type="button"
        className="btn btn--secondary"
        disabled={enable.isPending}
        onClick={() => {
          setAnswer(null);
          enable.mutate(undefined, { onSuccess: setAnswer });
        }}
      >
        <Icon name="bell" />
        {enable.isPending ? 'Activando…' : 'Activar en este teléfono'}
      </button>
    </div>
  );
}

function AvisosSection({ me }: { me: User }) {
  const update = useUpdatePreferences();
  const noPushId = useId();
  const pushIncluded = me.plan?.allows_push ?? true;
  const push = pushIncluded && (me.notify_push ?? true);
  const email = me.notify_email ?? true;
  return (
    <Section title="Cómo te avisamos">
      <p className="fine">Las alertas siempre quedan en Alertas, en la app.</p>
      <div className="switches">
        <Toggle
          label="Notificaciones push"
          checked={push}
          disabled={!pushIncluded}
          describedBy={pushIncluded ? undefined : noPushId}
          onChange={(notify_push) => update.mutate({ notify_push })}
        />
        <Toggle
          label="Alertas por email"
          checked={email}
          onChange={(notify_email) => update.mutate({ notify_email })}
        />
      </div>
      {!push && !email ? (
        <p className="account-warning">
          <Icon name="alert" size={20} strokeWidth={2.4} />
          Así no te llega ningún aviso al teléfono ni al email: las alertas quedan solo en Alertas.
        </p>
      ) : null}
      {!pushIncluded && me.plan ? (
        <p className="fine" id={noPushId}>
          Tu plan {me.plan.name} no incluye notificaciones push.{' '}
          <Link to="/planes">Ver planes</Link>
        </p>
      ) : null}
      {push ? <PushHere /> : null}
      <FormAlert message={update.failure?.message} />
      <Saved
        saving={update.saving}
        message={update.saving ? 'Guardando…' : update.saved ? 'Preferencias guardadas.' : null}
      />
    </Section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setCurrent('');
      setNext('');
    },
  });
  const form = useFocusFirstInvalid(change.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    change.mutate({ current_password: current, new_password: next });
  }

  return (
    <form ref={form} className="form account-form" onSubmit={submit} noValidate>
      <PasswordField
        label="Contraseña actual"
        name="current_password"
        autoComplete="current-password"
        value={current}
        error={fieldError(change.error, 'current_password')}
        onChange={(e) => {
          change.reset();
          setCurrent(e.target.value);
        }}
      />
      <PasswordField
        label="Contraseña nueva"
        name="new_password"
        autoComplete="new-password"
        hint="Al menos 8 caracteres. Cerramos tus otras sesiones."
        value={next}
        error={fieldError(change.error, 'new_password')}
        onChange={(e) => {
          change.reset();
          setNext(e.target.value);
        }}
      />
      <FormAlert message={formError(change.error)} />
      <button
        type="submit"
        className="btn btn--secondary"
        disabled={change.isPending || !current || !next}
      >
        Cambiar contraseña
      </button>
      <Saved message={change.isSuccess ? 'Contraseña cambiada.' : null} />
    </form>
  );
}

function BorrarSection({
  founderNumber,
  onDeleted,
}: {
  founderNumber: number | null;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const remove = useMutation({ mutationFn: deleteAccount, onSuccess: onDeleted });
  const form = useFocusFirstInvalid(remove.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    remove.mutate(password);
  }

  return (
    <Section title="Borrar cuenta">
      <details className="account-danger">
        <summary>
          <Icon name="chevronRight" className="account-danger-chevron" strokeWidth={2.4} />
          Quiero borrar mi cuenta
        </summary>
        <p>Borramos tu cuenta, tus lotes y tus alertas. No se puede deshacer.</p>
        {founderNumber !== null ? (
          // plans.py: a founder slot is never handed out twice, even after a delete.
          <p>Dejás de ser founder n.º {founderNumber}, y ese lugar no se le da a nadie más.</p>
        ) : null}
        <form ref={form} className="form account-form" onSubmit={submit} noValidate>
          <PasswordField
            label="Tu contraseña"
            name="password"
            autoComplete="current-password"
            value={password}
            error={fieldError(remove.error, 'password')}
            onChange={(e) => {
              remove.reset();
              setPassword(e.target.value);
            }}
          />
          <FormAlert message={formError(remove.error)} />
          <button
            type="submit"
            className="btn btn--danger-solid btn--block"
            disabled={remove.isPending || !password}
          >
            <Icon name="trash" />
            {remove.isPending ? 'Borrando…' : 'Borrar mi cuenta'}
          </button>
        </form>
      </details>
    </Section>
  );
}

export function Perfil() {
  const me = useMe();
  const endSession = useEndSession();
  const navigate = useNavigate();

  async function leave(signedOut: NonNullable<SignedOutState['signedOut']>) {
    // Ends the session at once (me = null), then moves in the same tick: had we waited for the
    // cleanup, the guard would redirect first and this screen, unmounted, could not say why.
    const ending = endSession({ localOnly: signedOut === 'local' });
    const state: SignedOutState = { signedOut };
    navigate('/ingresar', { replace: true, state });
    await ending;
  }

  const exit = useMutation({
    // A shared phone: drop this browser's push first, while the session can still say whose.
    mutationFn: async () => {
      await forgetPushBeforeLogout();
      await logout();
    },
    onSuccess: () => leave('server'),
    // No signal: the farmer still wants this phone clean, so sign out here and tell them.
    onError: (error) => (error instanceof ApiError && error.isNetwork ? leave('local') : undefined),
  });

  return (
    <div className="page page-profile">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="page-title">Perfil</h1>
        </div>
        {me.data ? (
          <div className="profile-id">
            <p className="profile-name">{me.data.name}</p>
            {me.data.founder_number != null ? (
              <FounderBadge number={me.data.founder_number} explain />
            ) : null}
          </div>
        ) : null}
      </header>
      {me.data ? (
        <>
          <AvisosSection me={me.data} />
          <PlanSection me={me.data} />
          <DatosSection key={`datos-${me.data.id}`} me={me.data} />
        </>
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
        Al salir borramos de este teléfono los datos de tu cuenta guardados para usar sin conexión.
        El pronóstico de los lugares que buscaste queda.
      </p>
      {me.data ? (
        <BorrarSection
          founderNumber={me.data.founder_number ?? null}
          onDeleted={() => leave('deleted')}
        />
      ) : null}
      <p className="credits">{CREDITS}</p>
    </div>
  );
}
