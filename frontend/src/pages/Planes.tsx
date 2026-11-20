import { Link } from 'react-router';
import type { Plan, User } from '../api/types';
import { Icon } from '../components/Icon';
import { CurrencyChoice, PricingCard } from '../components/PricingCard';
import { useCurrency, type Currency } from '../lib/currency';
import { membership } from '../lib/membership';
import { featuredFirst } from '../lib/planFeatures';
import { useMe, usePlans } from '../query/hooks';

function PlanCard({
  plan,
  currency,
  me,
  trialDays,
  paymentsEnabled,
}: {
  plan: Plan;
  currency: Currency;
  me: User | null | undefined;
  trialDays: number;
  paymentsEnabled: boolean;
}) {
  const current = me?.plan?.code === plan.code;
  // A real reason to choose the highlighted plan now (precios-productor S2): a visitor gets the
  // trial. The founder places left are the banner above the cards, said once.
  const perk = plan.highlighted && !me ? `Probalo ${trialDays} días gratis` : null;
  const subscribe =
    me && paymentsEnabled && canSubscribe(me, plan, current) ? (
      <Link className="btn btn--primary btn--block" to="/perfil/suscripcion">
        Suscribirme
      </Link>
    ) : null;
  const membershipLine = current && me ? membership(me) : null;
  return (
    <PricingCard
      plan={plan}
      currency={currency}
      headingLevel={2}
      current={current && !!me}
      perk={perk}
      note={
        membershipLine || (current && subscribe) ? (
          <>
            {membershipLine ? <p className="plan-membership">{membershipLine}</p> : null}
            {/* The current card shows "Tu plan" in place of the action: a trial keeps the way in. */}
            {current ? subscribe : null}
          </>
        ) : null
      }
      action={
        me && paymentsEnabled ? (
          subscribe
        ) : me ? (
          <button type="button" className="btn btn--secondary btn--block" disabled>
            Próximamente
          </button>
        ) : plan.highlighted ? (
          <Link className="btn btn--primary btn--block" to="/crear-cuenta">
            Crear cuenta gratis
          </Link>
        ) : null
      }
    />
  );
}

/**
 * With payments on (pagos-backoffice S8), a paid plan leads to Suscripción, where the checkout
 * starts. Not for Básico (free), a founder (Productor free for good, the API refuses them) or
 * the plan the account already pays; a trial account may subscribe to the plan it is trying.
 */
function canSubscribe(me: User, plan: Plan, current: boolean): boolean {
  if (plan.code === 'basico' || me.founder_number != null) return false;
  const onTrial = !!me.plan_expires_at;
  return !current || onTrial;
}

/** S1, S8: three plans, the middle one recommended, and the founder slots left. */
export function Planes() {
  const plans = usePlans();
  const me = useMe();
  const currency = useCurrency();

  return (
    <div className="page page-plans">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="page-title">Planes</h1>
        </div>
        <p className="page-lede">
          El pronóstico es libre para todos. El plan define cuántos lotes y alertas cuidás y cómo te
          avisamos.
        </p>
      </header>
      {plans.data ? (
        <>
          {plans.data.founders.remaining > 0 ? (
            <p className="founder-banner">
              <Icon name="sun" size={22} strokeWidth={2} />
              <span>
                Quedan {plans.data.founders.remaining} lugares de founder: Productor gratis para
                siempre.
              </span>
            </p>
          ) : null}
          <CurrencyChoice />
          <div className="pricing">
            {featuredFirst(plans.data.plans).map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                currency={currency}
                me={me.data}
                trialDays={plans.data.trial_days}
                paymentsEnabled={plans.data.payments_enabled ?? false}
              />
            ))}
          </div>
          {me.data ? (
            <Link className="account-link" to="/perfil/suscripcion">
              Administrar suscripción
            </Link>
          ) : null}
          <p className="fine">
            {plans.data.payments_enabled
              ? 'Los planes pagos se cobran en pesos con Mercado Pago, todos los meses, y te podés dar de baja cuando quieras.'
              : 'Todavía no cobramos: cuando habilitemos el pago te avisamos antes.'}{' '}
            Quien no es founder prueba Productor {plans.data.trial_days} días y después pasa a
            Básico.
          </p>
        </>
      ) : (
        <p className="notice">{plans.isError ? plans.error.message : 'Cargando planes…'}</p>
      )}
    </div>
  );
}
