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
}: {
  plan: Plan;
  currency: Currency;
  me: User | null | undefined;
  trialDays: number;
}) {
  const current = me?.plan?.code === plan.code;
  // A real reason to choose the highlighted plan now (precios-productor S2): a visitor gets the
  // trial. The founder places left are the banner above the cards, said once.
  const perk = plan.highlighted && !me ? `Probalo ${trialDays} días gratis` : null;
  return (
    <PricingCard
      plan={plan}
      currency={currency}
      headingLevel={2}
      current={current && !!me}
      perk={perk}
      note={
        current && me && membership(me) ? <p className="plan-membership">{membership(me)}</p> : null
      }
      action={
        me ? (
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
              />
            ))}
          </div>
          {me.data ? (
            <Link className="account-link" to="/perfil/suscripcion">
              Administrar suscripción
            </Link>
          ) : null}
          <p className="fine">
            Todavía no cobramos: cuando habilitemos el pago te avisamos antes. Quien no es founder
            prueba Productor {plans.data.trial_days} días y después pasa a Básico.
          </p>
        </>
      ) : (
        <p className="notice">{plans.isError ? plans.error.message : 'Cargando planes…'}</p>
      )}
    </div>
  );
}
