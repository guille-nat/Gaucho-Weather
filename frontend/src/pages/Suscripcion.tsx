import { useId, useState } from 'react';
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
import { StatusChip } from '../components/StatusChip';
import { TIME_ZONE } from '../lib/format';
import { trialLine } from '../lib/membership';
import { planFeatures } from '../lib/planFeatures';
import { usePlans, useRequestPlan, useSubscription, useWithdrawPlanRequest } from '../query/hooks';
import { Saved, Section } from './Perfil';
import { PlanFeatureList } from './Planes';

const dateLong = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
});
const formatWhen = (iso: string) => dateLong.format(new Date(iso));
const pesos = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

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
      <PlanFeatureList plan={plan} />
      <ul className="sub-usage" aria-label="Lo que estás usando">
        <li>
          <Icon name="parcel" size={20} />
          <span>{usageLine(usage.lotes, plan.max_lotes, ['lote', 'lotes'])}</span>
        </li>
        <li>
          <Icon name="bell" size={20} />
          <span>
            {usageLine(usage.alert_rules, plan.max_alert_rules, [
              'regla de alerta',
              'reglas de alerta',
            ])}
          </span>
        </li>
      </ul>
    </Section>
  );
}

function PendingRequest({
  sub,
  plans,
  onWithdrawn,
}: {
  sub: Subscription;
  plans: Plan[] | undefined;
  onWithdrawn: () => void;
}) {
  const withdraw = useWithdrawPlanRequest();
  const titleId = useId();
  const pending = sub.pending_request;
  if (!pending) return null;
  const target =
    pending.kind === 'cancel' ? planName(plans, 'basico') : planName(plans, pending.plan!);
  return (
    <section className="panel sub-pending" aria-labelledby={titleId}>
      <h2 className="panel-title" id={titleId}>
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

/** Moving down to Básico: said plainly before it is asked for (S4 rules on a downgrade). */
function CancelPlan({
  basico,
  disabled,
  onConfirm,
}: {
  basico: Plan;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const titleId = useId();

  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn--danger btn--block"
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        Darme de baja
      </button>
    );
  }
  return (
    <div className="confirm sub-cancel" role="group" aria-labelledby={titleId}>
      <p id={titleId} className="confirm-text">
        ¿Pasar al plan {basico.name}?
      </p>
      <p>Seguís con el pronóstico, tus lotes, tus reglas y el histórico.</p>
      <ul className="sub-cancel-losses">
        {basico.max_lotes !== null ? (
          <li>
            Si tenés más de {basico.max_lotes} lotes, quedan todos, pero no vas a poder crear
            nuevos.
          </li>
        ) : null}
        {basico.max_alert_rules !== null ? (
          <li>Las reglas de alerta después de la {basico.max_alert_rules}.ª se pausan.</li>
        ) : null}
        {!basico.allows_push ? (
          <li>No vas a recibir notificaciones push: te avisamos por email y en la app.</li>
        ) : null}
      </ul>
      <div className="confirm-actions">
        <button
          type="button"
          className="btn btn--danger-solid"
          disabled={disabled}
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          Sí, pedir la baja
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setAsking(false)}>
          Mejor no
        </button>
      </div>
    </div>
  );
}

function ChangePlan({
  sub,
  plans,
  saved,
  onSaved,
}: {
  sub: Subscription;
  plans: Plan[] | undefined;
  saved: string | null;
  onSaved: (message: string | null) => void;
}) {
  const request = useRequestPlan();
  const blocked = request.isPending || sub.pending_request !== null;
  const others = plans?.filter((p) => p.code !== sub.plan.code && p.code !== 'basico') ?? [];
  const basico = plans?.find((p) => p.code === 'basico');
  const ask = (input: PlanRequestInput) => {
    onSaved(null);
    request.mutate(input, { onSuccess: () => onSaved('Le pasamos tu pedido al equipo.') });
  };

  return (
    <Section title="Cambiar de plan">
      <p className="fine">
        Todavía no cobramos online: el equipo aplica tu pedido a mano y te avisa por email.
      </p>
      {sub.pending_request ? (
        <p className="fine">Ya tenés un pedido pendiente: retiralo si querés pedir otro.</p>
      ) : null}
      {sub.status === 'trial' ? (
        <div className="sub-keep">
          <p className="fine">
            Cuando termine la prueba pasás a Básico. Si querés seguir con {sub.plan.name}, pedilo
            ahora.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={blocked}
            onClick={() => ask({ kind: 'change', plan: sub.plan.code })}
          >
            Quedarme con {sub.plan.name}
          </button>
        </div>
      ) : null}
      {others.length ? (
        <div className="sub-options">
          {others.map((plan) => (
            <article key={plan.code} className="sub-option" aria-label={`Plan ${plan.name}`}>
              <div className="sub-option-body">
                <h3 className="sub-option-name">{plan.name}</h3>
                <p className="sub-option-price">
                  {plan.price_ars_month === null
                    ? 'Precio a confirmar'
                    : `$ ${pesos.format(plan.price_ars_month)} / mes`}
                </p>
                <p className="fine">
                  {planFeatures(plan)
                    .filter((f) => !f.missing)
                    .slice(0, 2)
                    .map((f) => f.text)
                    .join(' · ')}
                </p>
              </div>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={blocked}
                onClick={() => ask({ kind: 'change', plan: plan.code })}
              >
                Pedir este plan
              </button>
            </article>
          ))}
        </div>
      ) : null}
      <FormAlert message={request.error?.message} />
      <Saved message={saved} />
      {basico && sub.plan.code !== 'basico' ? (
        <CancelPlan basico={basico} disabled={blocked} onConfirm={() => ask({ kind: 'cancel' })} />
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
          {data.status === 'founder' && data.founder_number !== null ? (
            <Section title="Sos founder">
              <FounderStory number={data.founder_number} />
            </Section>
          ) : null}
          <PendingRequest
            sub={data}
            plans={plans.data?.plans}
            onWithdrawn={() => setSaved('Retiramos tu pedido.')}
          />
          <ChangePlan sub={data} plans={plans.data?.plans} saved={saved} onSaved={setSaved} />
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
