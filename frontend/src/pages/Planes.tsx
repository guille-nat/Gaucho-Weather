import { Link } from 'react-router';
import type { Plan, User } from '../api/types';
import { Icon } from '../components/Icon';
import { membership } from '../lib/membership';
import { planFeatures } from '../lib/planFeatures';
import { useMe, usePlans } from '../query/hooks';

const pesos = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** What a plan includes, with its limitations marked (shared with the subscription page). */
export function PlanFeatureList({ plan }: { plan: Plan }) {
  return (
    <ul className="plan-features">
      {planFeatures(plan).map((feature) => (
        <li key={feature.text} className={feature.missing ? 'plan-feature--missing' : undefined}>
          <Icon name={feature.icon} size={20} strokeWidth={2} />
          <span>{feature.text}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ plan, me }: { plan: Plan; me: User | null | undefined }) {
  const current = me?.plan?.code === plan.code;
  return (
    <article
      className={`plan-card${plan.highlighted ? ' plan-card--featured' : ''}${current ? ' plan-card--current' : ''}`}
      aria-label={`Plan ${plan.name}`}
    >
      {plan.highlighted ? <p className="plan-badge">Recomendado</p> : null}
      <h2 className="plan-name">{plan.name}</h2>
      <p className="plan-price">
        {plan.price_ars_month === null ? (
          <span className="plan-price-tbd">Precio a confirmar</span>
        ) : (
          <>
            <span className="plan-price-amount">$ {pesos.format(plan.price_ars_month)}</span>
            <span className="plan-price-period"> / mes</span>
          </>
        )}
      </p>
      <PlanFeatureList plan={plan} />
      <div className="plan-foot">
        {current && me ? (
          <>
            <p className="chip plan-current">
              <Icon name="check" size={16} strokeWidth={2.6} />
              Tu plan
            </p>
            {membership(me) ? <p className="plan-membership">{membership(me)}</p> : null}
          </>
        ) : me ? (
          <button type="button" className="btn btn--secondary btn--block" disabled>
            Próximamente
          </button>
        ) : plan.highlighted ? (
          <Link className="btn btn--primary btn--block" to="/crear-cuenta">
            Crear cuenta gratis
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/** S1, S8: three plans, the middle one recommended, and the founder slots left. */
export function Planes() {
  const plans = usePlans();
  const me = useMe();

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
          <div className="plans">
            {plans.data.plans.map((plan) => (
              <PlanCard key={plan.code} plan={plan} me={me.data} />
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
