import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  cancelSubscription,
  founderDifferenceNote,
  formatMoney,
  getMyPayments,
  goToCheckout,
  PAYMENT_WORDS,
  subscribe,
  SUBSCRIPTION_WORDS,
} from '../api/payments';
import type {
  MyPayments,
  Payment,
  PaymentStatus,
  Plan,
  PlanChange,
  PlanChangeReason,
  PlanCode,
  PlanRequestInput,
  ProviderSubscription,
  ProviderSubscriptionStatus,
  Subscription,
} from '../api/types';
import { FormAlert } from '../components/Field';
import { FounderBadge, FounderStory } from '../components/FounderBadge';
import { Icon } from '../components/Icon';
import { LegalLinks, TermsCheckbox } from '../components/Legal';
import { Modal } from '../components/Modal';
import { CurrencyChoice, PricingCard } from '../components/PricingCard';
import { StatusChip, type ChipTone } from '../components/StatusChip';
import { useCurrency } from '../lib/currency';
import { fieldError } from '../lib/formErrors';
import { TIME_ZONE } from '../lib/format';
import { trialLine } from '../lib/membership';
import { featuredFirst, planFeatures } from '../lib/planFeatures';
import { queryKeys } from '../query/keys';
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
  payment: 'Se aprobó tu pago',
  payment_ended: 'Terminó tu suscripción',
};

/** The account's Mercado Pago subscription and payments (pagos-backoffice S3, S6). */
const useMyPayments = () => useQuery({ queryKey: queryKeys.payments, queryFn: getMyPayments });

/** A running subscription is what "Darme de baja" cancels at Mercado Pago. */
const isRunning = (sub: ProviderSubscription | null | undefined): sub is ProviderSubscription =>
  sub?.status === 'authorized' || sub?.status === 'paused';

/** Starts the checkout and leaves for Mercado Pago, which comes back with `?pago=`. */
function useSubscribe() {
  return useMutation({
    mutationFn: ({ plan, acceptsTerms }: { plan: PlanCode; acceptsTerms: boolean }) =>
      subscribe(plan, acceptsTerms),
    onSuccess: ({ checkout_url }) => goToCheckout(checkout_url),
  });
}

/**
 * Said in plain words before leaving for Mercado Pago (promociones S0d, Ley 24.240's duty to
 * inform): the amount, that it renews, that the first charge is now, how to leave and what is
 * kept, and the terms. Only "Ir a Mercado Pago" creates the subscription.
 */
function CheckoutSummary({
  plan,
  amount,
  founder,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  plan: Plan;
  /** What the account pays a month for it (the founder difference); null = no price yet. */
  amount: number | null;
  founder: boolean;
  pending: boolean;
  error: Error | null;
  onConfirm: (acceptsTerms: boolean) => void;
  onClose: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  return (
    <>
      <p className="checkout-plan">Plan {plan.name}</p>
      <ul className="checkout-facts">
        <li>
          {amount !== null
            ? `Pagás ${formatMoney(amount)} por mes, en pesos, con Mercado Pago.`
            : 'Este plan todavía no tiene un precio confirmado.'}
          {founder && amount !== null
            ? ' Es la diferencia con Productor, que seguís teniendo gratis.'
            : null}
        </li>
        <li>Se renueva automáticamente todos los meses, hasta que te des de baja.</li>
        <li>El primer cobro es ahora, cuando confirmás el pago en Mercado Pago.</li>
        <li>Te podés dar de baja cuando quieras con «Darme de baja», en esta misma página.</li>
        <li>Si te das de baja, conservás el mes que ya pagaste y no te cobramos más.</li>
      </ul>
      <TermsCheckbox
        checked={accepted}
        onChange={setAccepted}
        error={fieldError(error, 'acepta_terminos')}
      />
      <FormAlert message={fieldError(error, 'acepta_terminos') ? null : error?.message} />
      <div className="app-dialog-actions">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={pending}
          onClick={() => onConfirm(accepted)}
        >
          {pending ? 'Abriendo Mercado Pago…' : 'Ir a Mercado Pago'}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          data-autofocus
          onClick={onClose}
        >
          Ahora no
        </button>
      </div>
    </>
  );
}

/** Cancels at Mercado Pago; the answer is the new state of the payments, shown at once. */
function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelSubscription,
    onSuccess: (payments: MyPayments) => {
      queryClient.setQueryData(queryKeys.payments, payments);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/** Where Mercado Pago sends the payer back (`back_url`): said once, at the top of the page. */
const RETURN_NOTICES: Record<string, { icon: 'check' | 'clock' | 'alertCircle'; text: string }> = {
  ok: {
    icon: 'check',
    text: 'Listo: Mercado Pago está procesando tu suscripción. Tu plan cambia apenas lo confirme.',
  },
  pendiente: {
    icon: 'clock',
    text: 'Tu pago quedó pendiente en Mercado Pago. Cuando se acredite, tu plan cambia solo.',
  },
  error: {
    icon: 'alertCircle',
    text: 'El pago no se completó en Mercado Pago. Podés intentarlo de nuevo.',
  },
};

function ReturnNotice() {
  const [params] = useSearchParams();
  const notice = RETURN_NOTICES[params.get('pago') ?? ''];
  if (!notice) return null;
  return (
    <div className="notice sub-return" role="status">
      <Icon name={notice.icon} size={22} strokeWidth={2.4} />
      <p>{notice.text}</p>
    </div>
  );
}

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
  paid,
  disabled,
  onConfirm,
}: {
  basico: Plan;
  current: Plan;
  usage: Subscription['usage'];
  trial: boolean;
  /** A founder keeps the number on Básico (plans.change_plan) and can ask to come back. */
  founderNumber: number | null;
  /** Paid with Mercado Pago: the baja cancels there, and the paid month is kept (S3). */
  paid: { until: string | null } | null;
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
        {trial && !paid ? 'Terminar la prueba ahora' : 'Darme de baja'}
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
            {paid
              ? `¿Darte de baja de ${current.name}?`
              : trial
                ? `¿Terminar la prueba y pasar a ${basico.name}?`
                : `¿Pasar al plan ${basico.name}?`}
          </h2>
          {paid ? (
            <p>
              {paid.until
                ? `Seguís con ${current.name} hasta el ${formatWhen(paid.until)}, el mes que ya pagaste. Después pasás a ${basico.name} y no te cobramos más.`
                : `Pasás a ${basico.name} y no te cobramos más.`}
            </p>
          ) : null}
          {trial && !paid ? <p>La prueba termina ahora, sin esperar al último día.</p> : null}
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
              {paid ? 'Sí, darme de baja' : trial ? 'Sí, terminar la prueba' : 'Sí, pedir la baja'}
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
  paymentsEnabled,
  provider,
  foundersLeft,
  founderPrice,
  saved,
  onSaved,
  onRequested,
}: {
  sub: Subscription;
  plans: Plan[] | undefined;
  /** Mercado Pago is on (`payments_enabled` of /api/planes/). */
  paymentsEnabled: boolean;
  /** The account's Mercado Pago subscription, once known. */
  provider: ProviderSubscription | null | undefined;
  foundersLeft: number;
  /** `founder_empresa_price_ars` of /api/planes/ (promociones SF5). */
  founderPrice: number | null;
  saved: string | null;
  onSaved: (message: string | null) => void;
  onRequested: () => void;
}) {
  const request = useRequestPlan();
  const pay = useSubscribe();
  // The plan whose summary is open before Mercado Pago (S0d).
  const [confirming, setConfirming] = useState<Plan | null>(null);
  const cancel = useCancelSubscription();
  const currency = useCurrency();
  const blocked = request.isPending || sub.pending_request !== null;
  const basico = plans?.find((p) => p.code === 'basico');
  const productor = plans?.find((p) => p.code === 'productor');
  const founder = sub.status === 'founder';
  // Everyone pays online once payments are on (S6). A founder already has Productor free, so
  // only Empresa is paid, at the difference (promociones SF5).
  const payable = paymentsEnabled;
  const payableFor = (plan: Plan) => payable && (!founder || plan.code === 'empresa');
  // Leaving for Mercado Pago: the button stays off until the page is gone.
  const paying = pay.isPending || pay.isSuccess;
  const running = isRunning(provider) ? provider : null;
  const ending = provider?.status === 'cancelled';
  const ask = (input: PlanRequestInput) => {
    onSaved(null);
    request.mutate(input, {
      onSuccess: () => {
        onSaved('Le pasamos tu pedido al equipo.');
        onRequested();
      },
    });
  };
  const startPayment = (plan: Plan) => {
    onSaved(null);
    cancel.reset();
    pay.reset();
    setConfirming(plan);
  };
  const closeSummary = () => {
    setConfirming(null);
    if (!pay.isSuccess) pay.reset();
  };
  // Like services.price_for: a founder pays only the Empresa difference.
  const amountFor = (plan: Plan) => (founder ? founderPrice : plan.price_ars_month || null);
  const cancelPayment = () => {
    onSaved(null);
    pay.reset();
    cancel.mutate(undefined, {
      onSuccess: ({ subscription }) =>
        onSaved(
          subscription?.ends_at
            ? `Te diste de baja. Seguís con ${sub.plan.name} hasta el ${formatWhen(subscription.ends_at)}.`
            : 'Te diste de baja.',
        ),
    });
  };

  const payButton = (plan: Plan) =>
    currency === 'usd' ? (
      // No gateway in dollars yet (S5): the user picks one later (L4).
      <button type="button" className="btn btn--secondary btn--block" disabled>
        Pagar en dólares: próximamente
      </button>
    ) : (
      <button
        type="button"
        className={`btn btn--block ${plan.highlighted ? 'btn--primary' : 'btn--secondary'}`}
        disabled={paying}
        onClick={() => startPayment(plan)}
      >
        Suscribirme
      </button>
    );

  // The three plans as pricing cards (precios-productor S3): the account's plan marked, the
  // others one request (or, with payments on, one checkout) away. Going down to Básico stays
  // the cancel flow below.
  const actionFor = (plan: Plan) => {
    if (plan.code === sub.plan.code) {
      if (sub.status !== 'trial') return null;
      if (payableFor(plan)) return payButton(plan);
      return (
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={blocked}
          onClick={() => ask({ kind: 'change', plan: plan.code })}
        >
          Quedarme con {plan.name}
        </button>
      );
    }
    if (founder && running) {
      // Paying Empresa: the baja takes a founder back to free Productor (promociones SF3).
      return plan.code === 'productor' ? (
        <p className="fine">Es el plan al que volvés gratis si te das de baja.</p>
      ) : null;
    }
    if (plan.code === 'basico') {
      return <p className="fine">Es el plan al que pasás si te das de baja.</p>;
    }
    if (payableFor(plan)) return payButton(plan);
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

  // A checkout's refusal shows in its summary, next to the button that asked (S0d).
  const error = request.error ?? cancel.error;
  return (
    <Section title="Cambiar de plan">
      <p className="fine">
        {payable
          ? 'Pagás en pesos con Mercado Pago, todos los meses.'
          : 'Todavía no cobramos online: el equipo aplica tu pedido a mano y te avisa por email.'}
      </p>
      {sub.pending_request ? (
        <p className="fine">Ya tenés un pedido pendiente: retiralo si querés pedir otro.</p>
      ) : null}
      {plans ? (
        <>
          <CurrencyChoice />
          <div className="pricing">
            {featuredFirst(plans).map((plan) => {
              const current = plan.code === sub.plan.code;
              const trial = current && sub.status === 'trial';
              return (
                <PricingCard
                  key={plan.code}
                  plan={plan}
                  currency={currency}
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
                    founder && !current && plan.code === 'empresa' && payable && founderPrice ? (
                      <p className="fine">{founderDifferenceNote(founderPrice)}</p>
                    ) : current && sub.status === 'founder' && sub.founder_number !== null ? (
                      // The card shows the plan's price; a founder pays none of it.
                      <p className="plan-membership">
                        Gratis para siempre: sos founder n.º {sub.founder_number}
                      </p>
                    ) : trial ? (
                      <p className="fine">
                        Cuando termine la prueba pasás a Básico. Si querés seguir con {plan.name},
                        {payable ? ' suscribite ahora.' : ' pedilo ahora.'}
                      </p>
                    ) : null
                  }
                />
              );
            })}
          </div>
        </>
      ) : null}
      <FormAlert message={error?.message} />
      <Saved message={saved} />
      {confirming ? (
        <Modal open title="Antes de ir a Mercado Pago" onClose={closeSummary}>
          <CheckoutSummary
            plan={confirming}
            amount={amountFor(confirming)}
            founder={founder}
            pending={paying}
            error={pay.error}
            onConfirm={(acceptsTerms) => pay.mutate({ plan: confirming.code, acceptsTerms })}
            onClose={closeSummary}
          />
        </Modal>
      ) : null}
      {basico && sub.plan.code !== 'basico' && !ending ? (
        <CancelPlan
          basico={(founder && running && productor) || basico}
          current={sub.plan}
          usage={sub.usage}
          trial={sub.status === 'trial'}
          founderNumber={sub.status === 'founder' ? sub.founder_number : null}
          paid={running ? { until: running.next_payment_at } : null}
          disabled={running ? cancel.isPending : blocked}
          onConfirm={running ? cancelPayment : () => ask({ kind: 'cancel' })}
        />
      ) : null}
    </Section>
  );
}

// The word carries the state; the chip's icon and fill only confirm it.
const SUBSCRIPTION_TONES: Record<ProviderSubscriptionStatus, ChipTone> = {
  pending: 'pending',
  authorized: 'ok',
  paused: 'pending',
  cancelled: 'pending',
};

const PAYMENT_TONES: Record<PaymentStatus, ChipTone> = {
  approved: 'ok',
  pending: 'pending',
  rejected: 'caution',
  refunded: 'caution',
  cancelled: 'caution',
};

export function SubscriptionStatusChip({ status }: { status: ProviderSubscriptionStatus }) {
  return <StatusChip tone={SUBSCRIPTION_TONES[status]}>{SUBSCRIPTION_WORDS[status]}</StatusChip>;
}

export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  return <StatusChip tone={PAYMENT_TONES[status]}>{PAYMENT_WORDS[status]}</StatusChip>;
}

function PaymentItem({ payment }: { payment: Payment }) {
  const when = payment.paid_at ?? payment.created_at;
  return (
    <li className="sub-payment">
      <time className="sub-payment-date" dateTime={when}>
        {formatWhen(when)}
      </time>
      <span className="sub-payment-amount">{formatMoney(payment.amount, payment.currency)}</span>
      <PaymentStatusChip status={payment.status} />
    </li>
  );
}

/** The Mercado Pago subscription and the payment history (S6). */
function PaymentsSection({ data }: { data: MyPayments }) {
  const { subscription, payments } = data;
  return (
    <Section title="Tus pagos">
      {subscription ? (
        <div className="sub-provider">
          <div className="sub-plan-head">
            <p className="sub-provider-plan">{subscription.plan_name}</p>
            <SubscriptionStatusChip status={subscription.status} />
          </div>
          <p className="sub-usage-line">
            {formatMoney(subscription.amount, subscription.currency)} / mes con Mercado Pago
          </p>
          {subscription.ends_at ? (
            <p className="fine">Termina el {formatWhen(subscription.ends_at)}</p>
          ) : subscription.next_payment_at && subscription.status === 'authorized' ? (
            <p className="fine">Próximo cobro el {formatWhen(subscription.next_payment_at)}</p>
          ) : null}
        </div>
      ) : null}
      {payments.length ? (
        <ul className="sub-payments" aria-label="Pagos">
          {payments.map((payment) => (
            <PaymentItem key={payment.id} payment={payment} />
          ))}
        </ul>
      ) : (
        <p className="fine">Todavía no hay pagos.</p>
      )}
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

/** Shown once there is something to show, or a way to pay; a founder without payments has neither. */
const showPayments = (data: MyPayments, sub: Subscription, enabled = false) =>
  data.subscription !== null || data.payments.length > 0 || (enabled && sub.status !== 'founder');

/** My subscription (cuenta-planes-alertas S14): plan, status, usage, requests and history. */
export function Suscripcion() {
  const sub = useSubscription();
  const plans = usePlans();
  const payments = useMyPayments();
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
      <ReturnNotice />
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
            paymentsEnabled={plans.data?.payments_enabled ?? false}
            provider={payments.data?.subscription}
            foundersLeft={plans.data?.founders.remaining ?? 0}
            founderPrice={plans.data?.founder_empresa_price_ars ?? null}
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
              {payments.data && showPayments(payments.data, data, plans.data?.payments_enabled) ? (
                <PaymentsSection data={payments.data} />
              ) : null}
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
          <footer className="page-legal">
            <LegalLinks />
          </footer>
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
