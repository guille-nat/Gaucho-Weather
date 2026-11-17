import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import type {
  Plan,
  PlanChange,
  PlanChangeReason,
  PlanCode,
  PlanRequestInput,
  Subscription,
} from '../api/types';
import { FormAlert } from '../components/Field';
import { FounderBadge, FounderStory } from '../components/FounderBadge';
import { Icon } from '../components/Icon';
import { PricingCard } from '../components/PricingCard';
import { StatusChip } from '../components/StatusChip';
import { TIME_ZONE } from '../lib/format';
import { trialLine } from '../lib/membership';
import { featuredFirst, planFeatures } from '../lib/planFeatures';
import { usePlans, useRequestPlan, useSubscription, useWithdrawPlanRequest } from '../query/hooks';
import { Saved, Section } from './Perfil';

const dateLong = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
});
const formatWhen = (iso: string) => dateLong.format(new Date(iso));

const REASONS: Record<PlanChangeReason, string> = {
  founder: 'Te sumaste como founder',
  trial: 'Empezó tu prueba de Productor',
  trial_ended: 'Terminó la prueba',
  request: 'Se aplicó tu pedido',
  staff: 'Cambio hecho por el equipo',
};

/** "1 de 15 lotes", or "2 reglas de alerta, sin límite" when the plan has no cap. */
function usageLine(count: number, max: number | null, [one, many]: [string, string]) {
  if (max !== null) return `${count} de ${max} ${many}`;
  return `${count} ${count === 1 ? one : many}, sin límite`;
}

const planName = (plans: Plan[] | undefined, code: PlanCode) =>
  plans?.find((p) => p.code === code)?.name ?? code;

function CurrentPlan({ sub }: { sub: Subscription }) {
  const { plan, usage } = sub;
  return (
    <Section title="Tu plan">
      <div className="sub-plan-head">
        <p className="account-plan">{plan.name}</p>
        {sub.status === 'founder' && sub.founder_number !== null ? (
          <FounderBadge number={sub.founder_number} />
        ) : sub.status === 'trial' && sub.trial_ends_at ? (
          <StatusChip tone="pending">{trialLine(sub.trial_ends_at)}</StatusChip>
        ) : (
          <StatusChip tone="ok">Activo</StatusChip>
        )}
      </div>
      {/* One list: each limit once, with its usage, then what the plan gives (perfil-ux S11). */}
      <ul className="plan-features sub-features" aria-label="Lo que incluye y lo que usás">
        <li>
          <Icon name="parcel" size={20} />
          <span className="sub-usage-line">
            {usageLine(usage.lotes, plan.max_lotes, ['lote', 'lotes'])}
          </span>
        </li>
        <li>
          <Icon name="bell" size={20} />
          <span className="sub-usage-line">
            {usageLine(usage.alert_rules, plan.max_alert_rules, [
              'regla de alerta',
              'reglas de alerta',
            ])}
          </span>
        </li>
        {planFeatures(plan)
          .filter((feature) => !feature.limit)
          .map((feature) => (
            <li
              key={feature.text}
              className={feature.missing ? 'plan-feature--missing' : undefined}
            >
              <Icon name={feature.icon} size={20} strokeWidth={2} />
              <span>{feature.text}</span>
            </li>
          ))}
      </ul>
    </Section>
  );
}

function PendingRequest({
  sub,
  plans,
  focus,
  onFocused,
  onWithdrawn,
}: {
  sub: Subscription;
  plans: Plan[] | undefined;
  /** Just asked for: the button that sent it is gone or disabled, so focus lands here. */
  focus: boolean;
  onFocused: () => void;
  onWithdrawn: () => void;
}) {
  const withdraw = useWithdrawPlanRequest();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pending = sub.pending_request;
  useEffect(() => {
    if (focus && pending && headingRef.current) {
      headingRef.current.focus();
      onFocused();
    }
  }, [focus, pending, onFocused]);
  if (!pending) return null;
  const target =
    pending.kind === 'cancel' ? planName(plans, 'basico') : planName(plans, pending.plan!);
  return (
    <section className="panel sub-pending" aria-labelledby={titleId}>
      <h2 className="panel-title" id={titleId} ref={headingRef} tabIndex={-1}>
        <Icon name="clock" size={22} strokeWidth={2.2} />
        Pedido pendiente
      </h2>
      <p className="sub-pending-text">Pediste pasar al plan {target}.</p>
      <p className="fine">
        Lo pediste el {formatWhen(pending.created_at)}. El equipo lo aplica a mano y te avisa por
        email.
      </p>
      <FormAlert message={withdraw.error?.message} />
      <button
        type="button"
        className="btn btn--secondary"
        disabled={withdraw.isPending}
        onClick={() => withdraw.mutate(undefined, { onSuccess: onWithdrawn })}
      >
        {withdraw.isPending ? 'Retirando…' : 'Retirar pedido'}
      </button>
    </section>
  );
}

/** "Tenés 5 lotes y Básico permite 2: …", only for a limit the account goes over. */
function losses(basico: Plan, usage: Subscription['usage']): string[] {
  const lines: string[] = [];
  const maxLotes = basico.max_lotes;
  if (maxLotes !== null && usage.lotes > maxLotes) {
    lines.push(
      `Tenés ${usage.lotes} lotes y ${basico.name} permite ${maxLotes}: quedan todos, pero no vas a poder crear nuevos.`,
    );
  }
  const maxRules = basico.max_alert_rules;
  if (maxRules !== null && usage.alert_rules > maxRules) {
    lines.push(
      `Tenés ${usage.alert_rules} reglas de alerta y ${basico.name} permite ${maxRules}: se pausan las que pasan de ${maxRules}.`,
    );
  }
  if (!basico.allows_push) {
    lines.push('No vas a recibir notificaciones push: te avisamos por email y en la app.');
  }
  return lines;
}

/**
 * Moving down to Básico: said plainly before it is asked for (S4 rules on a downgrade), from the
 * account's own numbers. On a trial it ends the trial early, and says so (perfil-ux S9).
 * A native modal dialog (perfil-ux S12): the browser keeps focus inside it, closes it on Esc and
 * the back gesture, and gives focus back to "Darme de baja"; the safe choice gets focus first.
 */
function CancelPlan({
  basico,
  current,
  usage,
  trial,
  founderNumber,
  disabled,
  onConfirm,
}: {
  basico: Plan;
  current: Plan;
  usage: Subscription['usage'];
  trial: boolean;
  /** A founder keeps the number on Básico (plans.change_plan) and can ask to come back. */
  founderNumber: number | null;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  const lost = losses(basico, usage);

  function open() {
    dialogRef.current?.showModal();
    // Opened from script, so the safe action is focused here rather than by `autofocus`.
    safeRef.current?.focus();
  }

  function closed() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const confirmed = dialog.returnValue === 'confirm';
    // Esc sets no value, and browsers differ on clearing the last one.
    dialog.returnValue = '';
    if (confirmed) onConfirm();
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--danger btn--block"
        disabled={disabled}
        onClick={open}
      >
        {trial ? 'Terminar la prueba ahora' : 'Darme de baja'}
      </button>
      <dialog
        ref={dialogRef}
        className="sub-cancel-dialog"
        aria-labelledby={titleId}
        onClose={closed}
      >
        {/* The look lives on this box: a display rule on <dialog> itself would show it closed. */}
        <div className="confirm sub-cancel">
          <h2 id={titleId} className="confirm-text">
            {trial
              ? `¿Terminar la prueba y pasar a ${basico.name}?`
              : `¿Pasar al plan ${basico.name}?`}
          </h2>
          {trial ? <p>La prueba termina ahora, sin esperar al último día.</p> : null}
          <p>Seguís con el pronóstico, tus lotes, tus reglas y el histórico.</p>
          {founderNumber !== null ? (
            <p>
              Seguís siendo founder n.º {founderNumber}: si después querés volver a {current.name},
              lo pedís desde acá.
            </p>
          ) : null}
          {lost.length ? (
            <ul className="sub-cancel-losses">
              {lost.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn--danger-solid"
              disabled={disabled}
              onClick={() => dialogRef.current?.close('confirm')}
            >
              {trial ? 'Sí, terminar la prueba' : 'Sí, pedir la baja'}
            </button>
            <button
              ref={safeRef}
              type="button"
              className="btn btn--secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Mejor no
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function ChangePlan({
  sub,
  plans,
  foundersLeft,
  saved,
  onSaved,
  onRequested,
}: {
  sub: Subscription;
  plans: Plan[] | undefined;
  foundersLeft: number;
  saved: string | null;
  onSaved: (message: string | null) => void;
  onRequested: () => void;
}) {
  const request = useRequestPlan();
  const blocked = request.isPending || sub.pending_request !== null;
  const basico = plans?.find((p) => p.code === 'basico');
  const ask = (input: PlanRequestInput) => {
    onSaved(null);
    request.mutate(input, {
      onSuccess: () => {
        onSaved('Le pasamos tu pedido al equipo.');
        onRequested();
      },
    });
  };

  // The three plans as pricing cards (precios-productor S3): the account's plan marked, the
  // others one request away. Going down to Básico stays the cancel flow below.
  const actionFor = (plan: Plan) => {
    if (plan.code === sub.plan.code) {
      return sub.status === 'trial' ? (
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={blocked}
          onClick={() => ask({ kind: 'change', plan: plan.code })}
        >
          Quedarme con {plan.name}
        </button>
      ) : null;
    }
    if (plan.code === 'basico') {
      return <p className="fine">Es el plan al que pasás si te das de baja.</p>;
    }
    return (
      <button
        type="button"
        className={`btn btn--block ${plan.highlighted ? 'btn--primary' : 'btn--secondary'}`}
        disabled={blocked}
        onClick={() => ask({ kind: 'change', plan: plan.code })}
      >
        Pedir este plan
      </button>
    );
  };

  return (
    <Section title="Cambiar de plan">
      <p className="fine">
        Todavía no cobramos online: el equipo aplica tu pedido a mano y te avisa por email.
      </p>
      {sub.pending_request ? (
        <p className="fine">Ya tenés un pedido pendiente: retiralo si querés pedir otro.</p>
      ) : null}
      {plans ? (
        <div className="pricing">
          {featuredFirst(plans).map((plan) => {
            const current = plan.code === sub.plan.code;
            const trial = current && sub.status === 'trial';
            return (
              <PricingCard
                key={plan.code}
                plan={plan}
                headingLevel={3}
                current={current && !trial}
                // Decided by the user (perfil-ux L6): the team emails the price first.
                priceNote="Te lo pasamos por email antes de aplicar el pedido."
                perk={
                  plan.highlighted && !current && sub.status !== 'founder' && foundersLeft > 0
                    ? `Quedan ${foundersLeft} lugares de founder: gratis para siempre`
                    : null
                }
                action={actionFor(plan)}
                note={
                  current && sub.status === 'founder' && sub.founder_number !== null ? (
                    // The card shows the plan's price; a founder pays none of it.
                    <p className="plan-membership">
                      Gratis para siempre: sos founder n.º {sub.founder_number}
                    </p>
                  ) : trial ? (
                    <p className="fine">
                      Cuando termine la prueba pasás a Básico. Si querés seguir con {plan.name},
                      pedilo ahora.
                    </p>
                  ) : null
                }
              />
            );
          })}
        </div>
      ) : null}
      <FormAlert message={request.error?.message} />
      <Saved message={saved} />
      {basico && sub.plan.code !== 'basico' ? (
        <CancelPlan
          basico={basico}
          current={sub.plan}
          usage={sub.usage}
          trial={sub.status === 'trial'}
          founderNumber={sub.status === 'founder' ? sub.founder_number : null}
          disabled={blocked}
          onConfirm={() => ask({ kind: 'cancel' })}
        />
      ) : null}
    </Section>
  );
}

function HistoryItem({ change }: { change: PlanChange }) {
  return (
    <li className="timeline-item">
      <span className="timeline-dot" aria-hidden="true" />
      <p className="timeline-title">{REASONS[change.reason]}</p>
      <p className="timeline-plans">
        {change.from_plan
          ? `${change.from_plan.name} → ${change.to_plan.name}`
          : change.to_plan.name}
      </p>
      <time className="fine" dateTime={change.at}>
        {formatWhen(change.at)}
      </time>
    </li>
  );
}

/** My subscription (cuenta-planes-alertas S14): plan, status, usage, requests and history. */
export function Suscripcion() {
  const sub = useSubscription();
  const plans = usePlans();
  const [saved, setSaved] = useState<string | null>(null);
  const [focusPending, setFocusPending] = useState(false);
  const focused = useCallback(() => setFocusPending(false), []);
  const data = sub.data;

  return (
    <div className="page page-profile page-subscription">
      <header className="page-head">
        <Link className="back-link" to="/perfil">
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Perfil
        </Link>
        <h1 className="page-title">Tu suscripción</h1>
      </header>
      {data ? (
        <>
          <CurrentPlan sub={data} />
          <PendingRequest
            sub={data}
            plans={plans.data?.plans}
            focus={focusPending}
            onFocused={focused}
            onWithdrawn={() => setSaved('Retiramos tu pedido.')}
          />
          <ChangePlan
            sub={data}
            plans={plans.data?.plans}
            foundersLeft={plans.data?.founders.remaining ?? 0}
            saved={saved}
            onSaved={setSaved}
            onRequested={() => setFocusPending(true)}
          />
          {/* Wide screens: the founder story beside the history. Phones stack them in order. */}
          <div className="page-columns">
            {data.status === 'founder' && data.founder_number !== null ? (
              <div className="page-col">
                <Section title="Sos founder">
                  <FounderStory number={data.founder_number} />
                </Section>
              </div>
            ) : null}
            <div className="page-col">
              <Section title="Historial">
                {data.history.length ? (
                  <ol className="timeline" aria-label="Cambios de plan">
                    {data.history.map((change, i) => (
                      // The same reason can land twice in one second (two staff edits): the
                      // position, newest first, keeps the key unique.
                      <HistoryItem key={`${change.at}-${change.reason}-${i}`} change={change} />
                    ))}
                  </ol>
                ) : (
                  <p className="fine">Todavía no hay cambios de plan.</p>
                )}
              </Section>
            </div>
          </div>
        </>
      ) : sub.isError ? (
        <div className="notice">
          <p>{sub.error.message}</p>
          <button type="button" className="btn btn--secondary" onClick={() => void sub.refetch()}>
            <Icon name="refresh" />
            Reintentar
          </button>
        </div>
      ) : (
        <div className="account-skeleton" aria-busy="true">
          <p className="sr-only" role="status">
            Cargando tu suscripción…
          </p>
          <span className="ghost ghost--panel" />
          <span className="ghost ghost--pill" />
          <span className="ghost ghost--panel" />
        </div>
      )}
    </div>
  );
}
