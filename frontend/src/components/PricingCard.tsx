import type { ReactNode } from 'react';
import type { Plan, PlanCode } from '../api/types';
import { planFeatures } from '../lib/planFeatures';
import { Icon } from './Icon';

const pesos = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** Who each plan is for: one line under its name (precios-productor S2). */
const FOR_WHOM: Record<PlanCode, string> = {
  basico: 'Para empezar con un par de lotes.',
  productor: 'Para cuidar todos tus lotes, con avisos al instante.',
  empresa: 'Para empresas y contratistas con muchos lotes.',
};

/** What a plan includes, with its limitations struck through (Planes and Suscripción). */
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

interface PricingCardProps {
  plan: Plan;
  /** h2 on Planes, h3 inside the subscription page's section. */
  headingLevel: 2 | 3;
  /** The account's plan: marked "Tu plan" instead of an action. */
  current?: boolean;
  /** A real reason to choose it now (founder places left, trial days), on the highlighted card. */
  perk?: ReactNode;
  /** Shown under "Precio a confirmar" while the plan has no price. */
  priceNote?: string;
  /** The card's one action, or a line saying how to get the plan. */
  action?: ReactNode;
  /** A line under the action, such as the founder number or the trial days left. */
  note?: ReactNode;
}

/**
 * One plan as a pricing card, the pattern of hosting pricing pages (precios-productor S2): name
 * and who it is for, a big price, the action, then what it includes. The highlighted plan carries
 * the ribbon "El más elegido" (true: founders and every trial are on Productor, L6), a gold ring
 * and the bright action. No struck-through reference price: only what is true (S4).
 */
export function PricingCard({
  plan,
  headingLevel,
  current = false,
  perk,
  priceNote,
  action,
  note,
}: PricingCardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const classes = ['pricing-card'];
  if (plan.highlighted) classes.push('pricing-card--featured');
  if (current) classes.push('pricing-card--current');
  return (
    <article className={classes.join(' ')} aria-label={`Plan ${plan.name}`}>
      {plan.highlighted ? <p className="pricing-ribbon">El más elegido</p> : null}
      <Heading className="pricing-name">{plan.name}</Heading>
      <p className="pricing-for">{FOR_WHOM[plan.code]}</p>
      <div className="pricing-price">
        {plan.price_ars_month === null ? (
          <>
            <p className="pricing-tbd">Precio a confirmar</p>
            {priceNote ? <p className="pricing-tbd-note">{priceNote}</p> : null}
          </>
        ) : (
          <p>
            <span className="pricing-amount">$ {pesos.format(plan.price_ars_month)}</span>
            <span className="pricing-period"> / mes</span>
          </p>
        )}
      </div>
      {perk ? (
        <p className="pricing-perk">
          <Icon name="sun" size={18} strokeWidth={2.2} />
          <span>{perk}</span>
        </p>
      ) : null}
      <div className="pricing-action">
        {current ? (
          <p className="chip plan-current">
            <Icon name="check" size={16} strokeWidth={2.6} />
            Tu plan
          </p>
        ) : (
          action
        )}
        {note}
      </div>
      <PlanFeatureList plan={plan} />
    </article>
  );
}
