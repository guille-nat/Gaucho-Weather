import { Link } from 'react-router';
import { founderDifferenceNote } from '../api/payments';
import type { Plan, User } from '../api/types';
import { Icon } from '../components/Icon';
import { LegalLinks } from '../components/Legal';
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
  founderPrice,
}: {
  plan: Plan;
  currency: Currency;
  me: User | null | undefined;
  trialDays: number;
  paymentsEnabled: boolean;
  /** `founder_empresa_price_ars` of /api/planes/ (promociones SF5). */
  founderPrice: number | null;
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
  // A founder moving up pays only the difference, as the API prices it.
  const founderLine =
    subscribe && me?.founder_number != null && founderPrice !== null
      ? founderDifferenceNote(founderPrice)
      : null;
  return (
    <PricingCard
      plan={plan}
      currency={currency}
      headingLevel={2}
      current={current && !!me}
      perk={perk}
      note={
        membershipLine || founderLine || (current && subscribe) ? (
          <>
            {membershipLine ? <p className="plan-membership">{membershipLine}</p> : null}
            {founderLine ? <p className="fine">{founderLine}</p> : null}
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
 * starts. Not for Básico (free) or the plan the account already pays; a trial account may
 * subscribe to the plan it is trying. A founder has Productor free for good, so only Empresa,
 * paying the difference (promociones SF5).
 */
function canSubscribe(me: User, plan: Plan, current: boolean): boolean {
  if (plan.code === 'basico') return false;
  if (me.founder_number != null) return plan.code === 'empresa' && !current;
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
                founderPrice={plans.data.founder_empresa_price_ars ?? null}
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
          <LegalLinks />
        </>
      ) : (
        <p className="notice">{plans.isError ? plans.error.message : 'Cargando planes…'}</p>
      )}
    </div>
  );
}
