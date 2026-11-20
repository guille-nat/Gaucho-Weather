import type { ReactNode } from 'react';
import type { Plan, PlanCode } from '../api/types';
import { setCurrency, useCurrency, type Currency } from '../lib/currency';
import { planFeatures } from '../lib/planFeatures';
import { Icon } from './Icon';

// Argentine grouping for both currencies: "$ 14.900", "US$ 1.200".
const amount = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** Each currency's price field and symbol (precios-productor S5): fixed prices, no conversion. */
const CURRENCIES: Record<
  Currency,
  { label: string; symbol: string; price: (plan: Plan) => number | null }
> = {
  ars: { label: 'Pesos', symbol: '$', price: (plan) => plan.price_ars_month },
  usd: { label: 'Dólares', symbol: 'US$', price: (plan) => plan.price_usd_month },
};

/**
 * Pesos or dollars for every card on the page, remembered on this device (precios-productor S5),
 * with the line saying both are accepted.
 */
export function CurrencyChoice() {
  const currency = useCurrency();
  return (
    <div className="pricing-currency">
      <div className="segmented segmented--currency" role="group" aria-label="Moneda">
        {(Object.keys(CURRENCIES) as Currency[]).map((code) => (
          <button
            key={code}
            type="button"
            className="segmented-option"
            aria-pressed={currency === code}
            onClick={() => setCurrency(code)}
          >
            {CURRENCIES[code].label}
          </button>
        ))}
      </div>
      <p className="fine">
        Podés pagar en pesos o en dólares. Actualizamos los precios cada 3 meses.
      </p>
    </div>
  );
}

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
  /** The currency chosen on the page, the same for every card. */
  currency: Currency;
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
  currency,
  headingLevel,
  current = false,
  perk,
  priceNote,
  action,
  note,
}: PricingCardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const { symbol, price: priceOf } = CURRENCIES[currency];
  const price = priceOf(plan);
  const classes = ['pricing-card'];
  if (plan.highlighted) classes.push('pricing-card--featured');
  if (current) classes.push('pricing-card--current');
  return (
    <article className={classes.join(' ')} aria-label={`Plan ${plan.name}`}>
      {plan.highlighted ? <p className="pricing-ribbon">El más elegido</p> : null}
      <Heading className="pricing-name">{plan.name}</Heading>
      <p className="pricing-for">{FOR_WHOM[plan.code]}</p>
      <div className="pricing-price">
        {price === null ? (
          <>
            <p className="pricing-tbd">Precio a confirmar</p>
            {priceNote ? <p className="pricing-tbd-note">{priceNote}</p> : null}
          </>
        ) : price === 0 ? (
          // A free plan says so: "$ 0 / mes" reads like a price to pay.
          <p className="pricing-amount">Gratis</p>
        ) : (
          <p>
            <span className="pricing-amount">
              {symbol} {amount.format(price)}
            </span>
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
