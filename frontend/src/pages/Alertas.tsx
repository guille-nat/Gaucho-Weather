import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ALERT_VARIABLES, COMPARATOR_WORDS, describeRule } from '../api/alerts';
import { isPlanLimit } from '../api/client';
import type { AlertComparator, AlertEvent, AlertRule, AlertVariable, User } from '../api/types';
import { FormAlert, SelectField, TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { formatDayMonth, formatTime, parseDecimal } from '../lib/format';
import {
  useAlertInbox,
  useAlertRules,
  useCreateAlertRule,
  useDeleteAlertRule,
  useDisablePush,
  useEnablePush,
  useLotes,
  useMarkAlertsRead,
  useMe,
  usePushHere,
  useUpdateAccount,
  useUpdateAlertRule,
} from '../query/hooks';
import { fieldError, formError } from '../lib/formErrors';
import { PUSH_BLOCKED, Saved, Section, Toggle } from './Perfil';

/** Custom alerts (odd/tasks/cuenta-planes-alertas.md S6) and their channels (S7). */

const PlansLink = ({ className = 'account-link' }: { className?: string }) => (
  <Link className={className} to="/planes">
    Ver planes
  </Link>
);

const when = (iso: string) => `${formatDayMonth(new Date(iso))}, ${formatTime(iso)}`;

function EventItem({ event, onRead }: { event: AlertEvent; onRead: () => void }) {
  const unread = event.read_at === null;
  const content = (
    <>
      <span className="alert-event-top">
        <span className="alert-event-title">{event.title}</span>
        {unread ? <span className="level level--caution">Nuevo</span> : null}
      </span>
      <span className="alert-event-body">{event.body}</span>
      <time className="alert-event-date" dateTime={event.created_at}>
        {when(event.created_at)}
      </time>
    </>
  );
  return (
    <li className={`alert-event${unread ? ' alert-event--unread' : ''}`}>
      {unread ? (
        // Tapping an unread alert is reading it.
        <button type="button" className="alert-event-tap" onClick={onRead}>
          {content}
        </button>
      ) : (
        <div className="alert-event-tap">{content}</div>
      )}
    </li>
  );
}

function InboxSection() {
  const inbox = useAlertInbox();
  const markRead = useMarkAlertsRead();
  const unread = inbox.data?.unread_count ?? 0;

  let list;
  if (inbox.data) {
    list = inbox.data.results.length ? (
      <ul className="alert-events">
        {inbox.data.results.map((event) => (
          <EventItem key={event.id} event={event} onRead={() => markRead.mutate([event.id])} />
        ))}
      </ul>
    ) : (
      <p className="fine">
        Todavía no hay avisos. Cuando se cumpla una de tus reglas, el aviso aparece acá.
      </p>
    );
  } else {
    list = inbox.isError ? null : <p className="fine">Buscando tus avisos…</p>;
  }

  return (
    <Section title="Avisos">
      {unread > 0 ? (
        <div className="alert-inbox-head">
          <p className="alert-unread">{unread} sin leer</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => markRead.mutate(undefined)}
            disabled={markRead.isPending}
          >
            Marcar todo como leído
          </button>
        </div>
      ) : null}
      {list}
      <FormAlert message={inbox.error?.message ?? markRead.error?.message} />
    </Section>
  );
}

function usageLine(count: number, cap: number | null) {
  if (cap !== null) return `${count} de ${cap} reglas`;
  return `${count} ${count === 1 ? 'regla' : 'reglas'}`;
}

function RuleItem({ rule }: { rule: AlertRule }) {
  const update = useUpdateAlertRule();
  const remove = useDeleteAlertRule();
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="alert-rule">
      <Toggle
        label={rule.description}
        checked={rule.enabled}
        disabled={update.isPending}
        onChange={(enabled) => update.mutate({ id: rule.id, changes: { enabled } })}
      />
      {rule.paused_by_plan ? (
        <p className="alert-rule-paused">
          <span className="level level--caution">Pausada por tu plan</span>
          <PlansLink />
        </p>
      ) : null}
      {confirming ? (
        <div className="alert-rule-confirm">
          <p>¿Borrar esta regla?</p>
          <button
            type="button"
            className="btn btn--danger-solid"
            disabled={remove.isPending}
            onClick={() => remove.mutate(rule.id)}
          >
            Sí, borrar
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--danger alert-rule-delete"
          aria-label={`Borrar ${rule.description}`}
          onClick={() => setConfirming(true)}
        >
          <Icon name="trash" />
          Borrar
        </button>
      )}
      <FormAlert message={update.error?.message ?? remove.error?.message} />
    </li>
  );
}

function RulesSection({ me }: { me: User }) {
  const rules = useAlertRules();
  const count = me.usage?.alert_rules ?? rules.data?.length ?? 0;
  return (
    <Section title="Tus reglas">
      <p className="account-usage">{usageLine(count, me.plan?.max_alert_rules ?? null)}</p>
      {rules.data ? (
        rules.data.length ? (
          <ul className="alert-rules">
            {rules.data.map((rule) => (
              <RuleItem key={rule.id} rule={rule} />
            ))}
          </ul>
        ) : (
          <p className="fine">Todavía no creaste reglas. Armá la primera abajo.</p>
        )
      ) : null}
      <FormAlert message={rules.error?.message} />
    </Section>
  );
}

const VARIABLES = Object.keys(ALERT_VARIABLES) as AlertVariable[];

/** "2.5" → "2,5": the suggested value as a person would type it. */
const asTyped = (value: number | null) => (value === null ? '' : String(value).replace('.', ','));

function NewRuleSection() {
  const lotes = useLotes();
  const create = useCreateAlertRule();
  const [loteId, setLoteId] = useState<number | null>(null);
  const [variable, setVariable] = useState<AlertVariable>('temp_min');
  const [comparator, setComparator] = useState<AlertComparator>('lt');
  const [threshold, setThreshold] = useState(asTyped(ALERT_VARIABLES.temp_min.suggested));

  const items = lotes.data?.items ?? [];
  if (lotes.data && !items.length) {
    return (
      <Section title="Nueva regla">
        <p>Para crear una regla primero cargá un lote.</p>
        <Link className="account-link" to="/lotes/nuevo">
          Cargar un lote
        </Link>
      </Section>
    );
  }

  const lote = items.find((l) => l.id === loteId) ?? items[0];
  const spec = ALERT_VARIABLES[variable];
  const spray = variable === 'spray_window';
  const value = parseDecimal(threshold);

  function choose(next: AlertVariable) {
    const nextSpec = ALERT_VARIABLES[next];
    setVariable(next);
    if (nextSpec.comparators.length && !nextSpec.comparators.includes(comparator)) {
      setComparator(nextSpec.comparators[0]!);
    }
    // The unit changes with the variable, so the old number would mean something else.
    setThreshold(asTyped(nextSpec.suggested));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!lote) return;
    create.mutate({
      lote: lote.id,
      variable,
      comparator: spray ? null : comparator,
      threshold: spray ? null : value,
    });
  }

  return (
    <Section title="Nueva regla">
      <form className="form account-form" onSubmit={submit} noValidate>
        <FormAlert message={formError(create.error)}>
          {isPlanLimit(create.error) ? <PlansLink className="form-alert-link" /> : null}
        </FormAlert>
        <SelectField
          label="Lote"
          name="lote"
          value={lote ? String(lote.id) : ''}
          error={fieldError(create.error, 'lote')}
          onChange={(e) => setLoteId(Number(e.target.value))}
        >
          {items.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Qué mirar"
          name="variable"
          value={variable}
          error={fieldError(create.error, 'variable')}
          onChange={(e) => choose(e.target.value as AlertVariable)}
        >
          {VARIABLES.map((v) => (
            <option key={v} value={v}>
              {ALERT_VARIABLES[v].label}
            </option>
          ))}
        </SelectField>
        {spray ? (
          <p className="fine">
            Te avisamos cuando se abra una ventana con viento, lluvia y temperatura a favor.
          </p>
        ) : (
          <div className="alert-rule-row">
            <SelectField
              label="Cuando sea"
              name="comparator"
              value={comparator}
              error={fieldError(create.error, 'comparator')}
              onChange={(e) => setComparator(e.target.value as AlertComparator)}
            >
              {spec.comparators.map((c) => (
                <option key={c} value={c}>
                  {COMPARATOR_WORDS[c]}
                </option>
              ))}
            </SelectField>
            <TextField
              label={`Valor (${spec.unit})`}
              name="threshold"
              inputMode="decimal"
              autoComplete="off"
              value={threshold}
              error={fieldError(create.error, 'threshold')}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
        )}
        {lote ? (
          <div className="alert-preview" aria-live="polite">
            <p className="alert-preview-label">Te avisamos ante</p>
            <p className="alert-preview-text">
              {spray || value !== null
                ? describeRule(variable, spray ? null : comparator, value, lote.name)
                : 'Poné un valor para ver la regla.'}
            </p>
          </div>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={create.isPending || !lote}>
          <Icon name="plus" />
          Crear regla
        </button>
        <Saved message={create.isSuccess ? 'Regla creada.' : null} />
      </form>
    </Section>
  );
}

function PushSection({ me }: { me: User }) {
  const here = usePushHere();
  const enable = useEnablePush();
  const disable = useDisablePush();
  const account = useUpdateAccount();
  const [answer, setAnswer] = useState<NotificationPermission | null>(null);
  const title = 'Notificaciones en este teléfono';

  if (me.plan && !me.plan.allows_push) {
    return (
      <Section title={title}>
        <p>Tu plan {me.plan.name} no incluye notificaciones push.</p>
        <p className="fine">Igual te avisamos por email y en esta pantalla.</p>
        <PlansLink />
      </Section>
    );
  }
  if (here.data && !here.data.supported) {
    return (
      <Section title={title}>
        <p>Este navegador no puede recibir notificaciones.</p>
        <p className="fine">
          En iPhone llegan solo con la app instalada: en Safari tocá Compartir y después «Agregar a
          inicio».
        </p>
      </Section>
    );
  }
  if (!here.data) return null;

  const subscribed = here.data.endpoint !== null;
  const blocked = answer === 'denied' || (!subscribed && here.data.permission === 'denied');

  function turnOn() {
    setAnswer(null);
    enable.mutate(undefined, {
      onSuccess: (result) => {
        setAnswer(result);
        // Asking for them here also means wanting them: undo an old "off" in Perfil.
        if (result === 'granted' && me.notify_push === false) account.mutate({ notify_push: true });
      },
    });
  }

  let state = subscribed ? 'Activadas en este teléfono.' : 'Desactivadas en este teléfono.';
  if (blocked) state = 'Bloqueadas en el navegador.';

  return (
    <Section title={title}>
      <p className="push-state" role="status">
        <Icon name={subscribed ? 'bell' : 'info'} size={20} />
        {state}
      </p>
      {blocked ? <p className="fine">{PUSH_BLOCKED}</p> : null}
      {answer === 'default' ? (
        <p className="fine">Hace falta tu permiso para avisarte en este teléfono.</p>
      ) : null}
      <FormAlert message={enable.error?.message}>
        {isPlanLimit(enable.error) ? <PlansLink className="form-alert-link" /> : null}
      </FormAlert>
      {subscribed ? (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => disable.mutate()}
          disabled={disable.isPending}
        >
          Desactivar en este teléfono
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--primary"
          onClick={turnOn}
          disabled={enable.isPending}
        >
          <Icon name="bell" />
          {enable.isPending ? 'Activando…' : 'Activar en este teléfono'}
        </button>
      )}
    </Section>
  );
}

export function Alertas() {
  const me = useMe();
  return (
    <div className="page page-alerts">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="page-title">Alertas</h1>
        </div>
        <p className="page-lede">
          Armá tus reglas por lote: te avisamos por notificación, por email y en esta pantalla.
        </p>
      </header>
      {/* Wide screens: what you read on the left, what you do on the right. Phones stack the
          columns in this same order. */}
      <div className="page-columns page-columns--wide-first">
        <div className="page-col">
          <InboxSection />
          {me.data ? <RulesSection me={me.data} /> : null}
        </div>
        {me.data ? (
          <div className="page-col">
            <NewRuleSection />
            <PushSection me={me.data} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
