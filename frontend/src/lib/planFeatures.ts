import type { Plan } from '../api/types';
import type { IconName } from '../components/Icon';

/** One line of what a plan includes (cuenta-planes-alertas S1). */
export interface PlanFeature {
  icon: IconName;
  text: string;
  /** A limitation of the plan rather than something it gives. */
  missing?: boolean;
}

/** What a plan includes, in the order /planes and the subscription page list it. */
export function planFeatures(plan: Plan): PlanFeature[] {
  const list: PlanFeature[] = [
    {
      icon: 'parcel',
      text: plan.max_lotes === null ? 'Lotes sin límite' : `Hasta ${plan.max_lotes} lotes`,
    },
    {
      icon: 'bell',
      text:
        plan.max_alert_rules === null
          ? 'Reglas de alerta sin límite'
          : `Hasta ${plan.max_alert_rules} reglas de alerta`,
    },
    plan.allows_push
      ? { icon: 'check', text: 'Notificaciones push' }
      : { icon: 'close', text: 'Sin notificaciones push', missing: true },
    { icon: 'check', text: 'Alertas por email y en la app' },
  ];
  if (plan.priority_support) list.push({ icon: 'check', text: 'Soporte prioritario' });
  return list;
}
